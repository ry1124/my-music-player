// ===== 状態 =====
let tracks = [];            // DBから読み込んだ全曲
let playlists = [];         // 全プレイリスト
let currentQueue = [];      // 再生中のtrackId配列(シャッフル適用後)
let baseQueue = [];         // シャッフル前の元の並び
let currentIndex = -1;
let currentTrack = null;
let isShuffle = false;
let repeatMode = 'off';     // 'off' | 'all' | 'one'
let currentAudioUrl = null;
let seeking = false;
let currentPlaylistId = null; // プレイリスト詳細画面で表示中のID
const artworkUrlCache = new Map(); // trackId -> objectURL

const audioEl = document.getElementById('audio-el');

// ===== 初期化 =====
window.addEventListener('DOMContentLoaded', async () => {
  registerServiceWorker();
  tracks = await DB.getAllTracks();
  playlists = await DB.getAllPlaylists();
  renderTrackList();
  renderPlaylistList();
  bindUIEvents();
  bindAudioEvents();
});

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('service-worker.js').catch(() => {});
  }
}

// ===== タブ切り替え =====
function showView(id) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function bindUIEvents() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const tab = btn.dataset.tab;
      showView(tab === 'library' ? 'view-library' : 'view-playlists');
    });
  });

  document.getElementById('btn-add').addEventListener('click', () => {
    document.getElementById('file-input').click();
  });
  document.getElementById('file-input').addEventListener('change', (e) => {
    handleFilesSelected(e.target.files);
    e.target.value = '';
  });

  document.getElementById('btn-import-lyrics').addEventListener('click', () => {
    document.getElementById('lyrics-file-input').click();
  });
  document.getElementById('lyrics-file-input').addEventListener('change', (e) => {
    handleLyricsFilesSelected(e.target.files);
    e.target.value = '';
  });

  document.getElementById('btn-auto-lyrics').addEventListener('click', autoFetchLyrics);

  document.getElementById('search-input').addEventListener('input', (e) => {
    renderTrackList(e.target.value.trim());
  });

  document.getElementById('btn-new-playlist').addEventListener('click', createPlaylistPrompt);
  document.getElementById('btn-back-playlists').addEventListener('click', () => showView('view-playlists'));
  document.getElementById('btn-delete-playlist').addEventListener('click', deleteCurrentPlaylist);

  // ミニプレイヤー
  document.getElementById('mini-player').addEventListener('click', (e) => {
    if (e.target.closest('button')) return;
    openNowPlaying();
  });
  document.getElementById('mini-playpause').addEventListener('click', (e) => { e.stopPropagation(); togglePlayPause(); });
  document.getElementById('mini-next').addEventListener('click', (e) => { e.stopPropagation(); playNext(); });

  // Now Playing
  document.getElementById('btn-collapse-nowplaying').addEventListener('click', () => {
    showView(document.querySelector('.tab-btn.active').dataset.tab === 'playlists' ? 'view-playlists' : 'view-library');
  });
  document.getElementById('btn-playpause').addEventListener('click', togglePlayPause);
  document.getElementById('btn-prev').addEventListener('click', playPrev);
  document.getElementById('btn-next').addEventListener('click', playNext);
  document.getElementById('btn-shuffle').addEventListener('click', toggleShuffle);
  document.getElementById('btn-repeat').addEventListener('click', cycleRepeat);
  document.getElementById('btn-lyrics-toggle').addEventListener('click', toggleLyrics);

  const seekBar = document.getElementById('seek-bar');
  seekBar.addEventListener('input', () => { seeking = true; });
  seekBar.addEventListener('change', () => {
    if (audioEl.duration) audioEl.currentTime = (seekBar.value / 1000) * audioEl.duration;
    seeking = false;
  });
}

// ===== ファイル取り込み(ID3解析) =====
const IMPORT_CONCURRENCY = 4; // 同時並列処理数(多すぎるとiOS Safariでメモリ逼迫のおそれ)

function makeSourceKey(file) {
  return `${file.name}_${file.size}_${file.lastModified}`;
}

async function importOneFile(file, sourceKey, orderHint) {
  const tags = await readTags(file);
  const duration = await getAudioDuration(file);
  const artworkBlob = pictureToBlob(tags.picture);
  const lyrics = extractLyrics(tags);
  const track = {
    title: (tags.title && tags.title.trim()) || file.name.replace(/\.[^/.]+$/, ''),
    artist: (tags.artist && tags.artist.trim()) || '不明なアーティスト',
    album: (tags.album && tags.album.trim()) || '',
    duration,
    fileBlob: file,
    mimeType: file.type || 'audio/mpeg',
    artworkBlob,
    lyrics,
    sourceKey,
    addedAt: Date.now() + orderHint,
  };
  const id = await DB.addTrack(track);
  track.id = id;
  return track;
}

async function handleFilesSelected(fileList) {
  const files = Array.from(fileList);
  if (files.length === 0) return;
  const progressEl = document.getElementById('import-progress');
  progressEl.classList.remove('hidden');

  const existingKeys = new Set(tracks.map(t => t.sourceKey).filter(Boolean));
  const targets = [];
  let skippedCount = 0;
  for (const file of files) {
    const sourceKey = makeSourceKey(file);
    if (existingKeys.has(sourceKey)) {
      skippedCount++;
    } else {
      existingKeys.add(sourceKey); // 同一選択内の重複も先に弾く
      targets.push({ file, sourceKey });
    }
  }

  let addedCount = 0;
  let processedCount = 0;
  const startTime = Date.now();

  const updateProgress = (fileName) => {
    processedCount++;
    const elapsedSec = (Date.now() - startTime) / 1000;
    const rate = processedCount / elapsedSec;
    const remaining = targets.length - processedCount;
    const etaMin = rate > 0 ? Math.ceil(remaining / rate / 60) : 0;
    const etaText = etaMin > 0 ? `(残り約${etaMin}分)` : '';
    progressEl.textContent =
      `取り込み中... ${processedCount}/${targets.length}曲 ${etaText} ` +
      (skippedCount > 0 ? `[既存${skippedCount}曲はスキップ済み] ` : '') +
      fileName;
  };

  for (let i = 0; i < targets.length; i += IMPORT_CONCURRENCY) {
    const chunk = targets.slice(i, i + IMPORT_CONCURRENCY);
    const results = await Promise.all(chunk.map(async ({ file, sourceKey }, idx) => {
      try {
        const track = await importOneFile(file, sourceKey, i + idx);
        return track;
      } catch (err) {
        console.error('取り込み失敗:', file.name, err);
        return null;
      } finally {
        updateProgress(file.name);
      }
    }));
    results.forEach((track) => {
      if (track) {
        tracks.push(track);
        addedCount++;
      }
    });
  }

  progressEl.classList.add('hidden');
  renderTrackList(document.getElementById('search-input').value.trim());
  const totalSec = Math.round((Date.now() - startTime) / 1000);
  const timeText = totalSec >= 60 ? `${Math.floor(totalSec / 60)}分${totalSec % 60}秒` : `${totalSec}秒`;
  alert(`取り込み完了: 新規${addedCount}曲を追加、${skippedCount}曲は追加済みのためスキップ(所要${timeText})`);
}

function readTags(file) {
  return new Promise((resolve) => {
    if (typeof jsmediatags === 'undefined') { resolve({}); return; }
    jsmediatags.read(file, {
      onSuccess: (tag) => resolve(tag.tags || {}),
      onError: () => resolve({}),
    });
  });
}

function pictureToBlob(picture) {
  if (!picture || !picture.data) return null;
  const byteArray = new Uint8Array(picture.data);
  return new Blob([byteArray], { type: picture.format || 'image/jpeg' });
}

// ===== 外部歌詞ファイル(.lrc/.txt)の読み込み =====
// LRC形式([mm:ss.xx]歌詞)をパースし、タイムスタンプ付きの行配列にする。
// タイムスタンプが無い(通常の.txt等)場合は空配列を返す。
function parseLrc(text) {
  const lines = text.split(/\r?\n/);
  const timeTagRegex = /\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g;
  const result = [];
  for (const line of lines) {
    const matches = [...line.matchAll(timeTagRegex)];
    if (matches.length === 0) continue;
    const lineText = line.replace(timeTagRegex, '').trim();
    for (const m of matches) {
      const min = parseInt(m[1], 10);
      const sec = parseInt(m[2], 10);
      const ms = m[3] ? parseInt(m[3].padEnd(3, '0'), 10) : 0;
      result.push({ time: min * 60 + sec + ms / 1000, text: lineText });
    }
  }
  result.sort((a, b) => a.time - b.time);
  return result;
}

function stripLrcTimestamps(text) {
  return text
    .split(/\r?\n/)
    .map(line => line.replace(/\[\d{1,2}:\d{2}(?:[.:]\d{1,3})?\]/g, '').trim())
    .filter(line => line.length > 0 && !/^\[[a-zA-Z]+:.*\]$/.test(line))
    .join('\n');
}

function applyLyricsText(track, text) {
  const synced = parseLrc(text);
  track.syncedLyrics = synced.length > 0 ? synced : null;
  track.lyrics = synced.length > 0
    ? synced.map(l => l.text).filter(Boolean).join('\n')
    : stripLrcTimestamps(text);
}

function importLyricsForTrack(track) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.lrc,.txt,text/plain';
  input.onchange = async () => {
    const file = input.files[0];
    if (!file) return;
    const text = await file.text();
    applyLyricsText(track, text);
    await DB.updateTrack(track);
    alert(`「${track.title}」に歌詞を読み込みました${track.syncedLyrics ? '(曲に合わせて動きます)' : ''}`);
    if (currentTrack && currentTrack.id === track.id) { lastActiveLyricIdx = -1; updateLyricsPane(); }
  };
  input.click();
}

async function handleLyricsFilesSelected(fileList) {
  const files = Array.from(fileList);
  if (files.length === 0) return;
  let matched = 0;
  let syncedCount = 0;
  const unmatchedNames = [];
  for (const file of files) {
    const baseName = file.name.replace(/\.[^/.]+$/, '').trim();
    const track = tracks.find(t => t.title.trim() === baseName);
    if (!track) { unmatchedNames.push(file.name); continue; }
    try {
      const text = await file.text();
      applyLyricsText(track, text);
      await DB.updateTrack(track);
      matched++;
      if (track.syncedLyrics) syncedCount++;
    } catch (err) {
      console.error('歌詞読み込み失敗:', file.name, err);
      unmatchedNames.push(file.name);
    }
  }
  if (currentTrack) { lastActiveLyricIdx = -1; updateLyricsPane(); }
  const unmatchedText = unmatchedNames.length > 0
    ? `\n\n曲名が一致せず未適用(${unmatchedNames.length}件):\n` + unmatchedNames.slice(0, 10).join('\n') + (unmatchedNames.length > 10 ? '\n...' : '')
    : '';
  alert(`歌詞インポート完了: ${matched}曲に適用(うち${syncedCount}曲は曲に合わせて動きます)${unmatchedText}`);
}

// ===== 歌詞のネット自動検索(lrclib.net) =====
const LRCLIB_BASE = 'https://lrclib.net/api';
let isAutoFetchingLyrics = false;

async function fetchLrcFromLrclib(artist, title) {
  const url = `${LRCLIB_BASE}/get?artist_name=${encodeURIComponent(artist)}&track_name=${encodeURIComponent(title)}`;
  const res = await fetch(url);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function autoFetchLyrics() {
  if (isAutoFetchingLyrics) { alert('すでに検索中です'); return; }
  const targets = tracks.filter(t => !t.lyrics);
  if (targets.length === 0) { alert('歌詞が無い曲はありません'); return; }
  if (!confirm(`歌詞が無い${targets.length}曲をネットで自動検索します。曲数によっては数分〜十数分かかります。アプリを開いたまま待つ必要があります。始めますか?`)) return;

  isAutoFetchingLyrics = true;
  const progressEl = document.getElementById('import-progress');
  progressEl.classList.remove('hidden');
  let found = 0, syncedCount = 0, notFound = 0, errorCount = 0;
  const startTime = Date.now();

  for (let i = 0; i < targets.length; i++) {
    const track = targets[i];
    const elapsedSec = (Date.now() - startTime) / 1000;
    const rate = i / elapsedSec;
    const etaMin = rate > 0 ? Math.ceil((targets.length - i) / rate / 60) : 0;
    progressEl.textContent =
      `歌詞をネット検索中... ${i + 1}/${targets.length}曲 (見つかった:${found}件) ` +
      (etaMin > 0 ? `残り約${etaMin}分 ` : '') + track.title;
    try {
      const data = await fetchLrcFromLrclib(track.artist, track.title);
      if (data && (data.syncedLyrics || data.plainLyrics)) {
        if (data.syncedLyrics) {
          const synced = parseLrc(data.syncedLyrics);
          track.syncedLyrics = synced.length > 0 ? synced : null;
          track.lyrics = synced.length > 0 ? synced.map(l => l.text).filter(Boolean).join('\n') : data.plainLyrics || '';
          if (track.syncedLyrics) syncedCount++;
        } else {
          track.syncedLyrics = null;
          track.lyrics = data.plainLyrics;
        }
        await DB.updateTrack(track);
        found++;
      } else {
        notFound++;
      }
    } catch (err) {
      console.error('歌詞検索失敗:', track.title, err);
      errorCount++;
    }
    await new Promise(r => setTimeout(r, 250)); // lrclib.netへの負荷・レート制限を避けるための間隔
  }

  isAutoFetchingLyrics = false;
  progressEl.classList.add('hidden');
  if (currentTrack) { lastActiveLyricIdx = -1; updateLyricsPane(); }
  alert(`歌詞自動検索完了: ${found}曲ヒット(うち${syncedCount}曲は曲に合わせて動きます) / 見つからず${notFound}曲 / エラー${errorCount}件`);
}

function extractLyrics(tags) {
  if (!tags) return '';
  if (tags.lyrics) {
    if (typeof tags.lyrics === 'string') return tags.lyrics;
    if (tags.lyrics.lyrics) return tags.lyrics.lyrics;
  }
  if (tags.USLT && tags.USLT.data && tags.USLT.data.lyrics) return tags.USLT.data.lyrics;
  return '';
}

function getAudioDuration(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const a = new Audio();
    a.preload = 'metadata';
    const cleanup = (val) => { URL.revokeObjectURL(url); resolve(val); };
    a.onloadedmetadata = () => cleanup(a.duration || 0);
    a.onerror = () => cleanup(0);
    a.src = url;
  });
}

// ===== 曲一覧描画 =====
function getArtworkUrl(track) {
  if (!track) return 'icons/default-artwork.png';
  if (artworkUrlCache.has(track.id)) return artworkUrlCache.get(track.id);
  const url = track.artworkBlob ? URL.createObjectURL(track.artworkBlob) : 'icons/default-artwork.png';
  artworkUrlCache.set(track.id, url);
  return url;
}

function renderTrackList(filter = '') {
  const listEl = document.getElementById('track-list');
  const emptyHint = document.getElementById('empty-hint');
  listEl.innerHTML = '';
  const f = filter.toLowerCase();
  const filtered = tracks
    .filter(t => !f || t.title.toLowerCase().includes(f) || t.artist.toLowerCase().includes(f))
    .sort((a, b) => b.addedAt - a.addedAt);

  emptyHint.classList.toggle('hidden', tracks.length > 0);

  filtered.forEach(track => {
    listEl.appendChild(buildTrackItem(track, filtered.map(t => t.id)));
  });
}

function buildTrackItem(track, queueIds) {
  const li = document.createElement('li');
  li.className = 'track-item' + (currentTrack && currentTrack.id === track.id ? ' playing' : '');

  const img = document.createElement('img');
  img.className = 'track-artwork';
  img.src = getArtworkUrl(track);
  img.alt = '';

  const meta = document.createElement('div');
  meta.className = 'track-meta';
  const titleEl = document.createElement('div');
  titleEl.className = 'track-title';
  titleEl.textContent = track.title;
  const artistEl = document.createElement('div');
  artistEl.className = 'track-artist';
  artistEl.textContent = track.artist;
  meta.appendChild(titleEl);
  meta.appendChild(artistEl);

  const menuBtn = document.createElement('button');
  menuBtn.className = 'track-menu-btn';
  menuBtn.textContent = '⋯';
  menuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    openTrackActionSheet(track);
  });

  li.appendChild(img);
  li.appendChild(meta);
  li.appendChild(menuBtn);
  li.addEventListener('click', () => playTrackById(track.id, queueIds));
  return li;
}

// ===== アクションシート(簡易メニュー) =====
function openTrackActionSheet(track) {
  const options = ['プレイリストに追加', '歌詞ファイルを読み込む'];
  if (currentPlaylistId !== null) options.push('このプレイリストから削除');
  options.push('ライブラリから削除', 'キャンセル');
  const choice = prompt(
    `${track.title}\n\n番号を入力してください:\n` + options.map((o, i) => `${i + 1}. ${o}`).join('\n'),
    ''
  );
  const idx = parseInt(choice, 10) - 1;
  if (isNaN(idx) || idx < 0 || idx >= options.length) return;
  const label = options[idx];
  if (label === 'プレイリストに追加') addTrackToPlaylistPrompt(track.id);
  else if (label === '歌詞ファイルを読み込む') importLyricsForTrack(track);
  else if (label === 'このプレイリストから削除') removeTrackFromCurrentPlaylist(track.id);
  else if (label === 'ライブラリから削除') deleteTrackFromLibrary(track.id);
}

async function deleteTrackFromLibrary(trackId) {
  if (!confirm('この曲をライブラリから削除しますか?')) return;
  await DB.deleteTrack(trackId);
  tracks = tracks.filter(t => t.id !== trackId);
  playlists.forEach(p => { p.trackIds = p.trackIds.filter(id => id !== trackId); });
  for (const p of playlists) await DB.updatePlaylist(p);
  renderTrackList(document.getElementById('search-input').value.trim());
  renderPlaylistList();
}

// ===== プレイリスト =====
function renderPlaylistList() {
  const listEl = document.getElementById('playlist-list');
  listEl.innerHTML = '';
  playlists.slice().sort((a, b) => b.createdAt - a.createdAt).forEach(pl => {
    const li = document.createElement('li');
    li.className = 'playlist-item';
    const firstTrack = tracks.find(t => t.id === pl.trackIds[0]);
    const img = document.createElement('img');
    img.className = 'playlist-artwork';
    img.src = firstTrack ? getArtworkUrl(firstTrack) : 'icons/default-artwork.png';
    const meta = document.createElement('div');
    meta.className = 'track-meta';
    const nameEl = document.createElement('div');
    nameEl.className = 'playlist-name';
    nameEl.textContent = pl.name;
    const countEl = document.createElement('div');
    countEl.className = 'playlist-count';
    countEl.textContent = `${pl.trackIds.length}曲`;
    meta.appendChild(nameEl);
    meta.appendChild(countEl);
    li.appendChild(img);
    li.appendChild(meta);
    li.addEventListener('click', () => openPlaylistDetail(pl.id));
    listEl.appendChild(li);
  });
}

async function createPlaylistPrompt() {
  const name = prompt('プレイリスト名を入力してください');
  if (!name || !name.trim()) return;
  const playlist = { name: name.trim(), trackIds: [], createdAt: Date.now() };
  const id = await DB.addPlaylist(playlist);
  playlist.id = id;
  playlists.push(playlist);
  renderPlaylistList();
}

function openPlaylistDetail(playlistId) {
  currentPlaylistId = playlistId;
  const pl = playlists.find(p => p.id === playlistId);
  if (!pl) return;
  document.getElementById('playlist-detail-title').textContent = pl.name;
  const listEl = document.getElementById('playlist-detail-list');
  listEl.innerHTML = '';
  const plTracks = pl.trackIds.map(id => tracks.find(t => t.id === id)).filter(Boolean);
  plTracks.forEach(track => {
    listEl.appendChild(buildTrackItem(track, pl.trackIds));
  });
  showView('view-playlist-detail');
}

async function deleteCurrentPlaylist() {
  if (currentPlaylistId === null) return;
  if (!confirm('このプレイリストを削除しますか? (曲自体はライブラリに残ります)')) return;
  await DB.deletePlaylist(currentPlaylistId);
  playlists = playlists.filter(p => p.id !== currentPlaylistId);
  currentPlaylistId = null;
  renderPlaylistList();
  showView('view-playlists');
}

async function addTrackToPlaylistPrompt(trackId) {
  if (playlists.length === 0) {
    const name = prompt('プレイリストがありません。新規作成しますか?名前を入力してください');
    if (!name || !name.trim()) return;
    const playlist = { name: name.trim(), trackIds: [trackId], createdAt: Date.now() };
    const id = await DB.addPlaylist(playlist);
    playlist.id = id;
    playlists.push(playlist);
    renderPlaylistList();
    return;
  }
  const listText = playlists.map((p, i) => `${i + 1}. ${p.name}`).join('\n');
  const choice = prompt(`追加先のプレイリスト番号を入力してください:\n${listText}`, '');
  const idx = parseInt(choice, 10) - 1;
  if (isNaN(idx) || idx < 0 || idx >= playlists.length) return;
  const pl = playlists[idx];
  if (!pl.trackIds.includes(trackId)) {
    pl.trackIds.push(trackId);
    await DB.updatePlaylist(pl);
  }
  renderPlaylistList();
}

async function removeTrackFromCurrentPlaylist(trackId) {
  const pl = playlists.find(p => p.id === currentPlaylistId);
  if (!pl) return;
  pl.trackIds = pl.trackIds.filter(id => id !== trackId);
  await DB.updatePlaylist(pl);
  openPlaylistDetail(pl.id);
  renderPlaylistList();
}

// ===== 再生制御 =====
function playTrackById(id, queueIds) {
  const track = tracks.find(t => t.id === id);
  if (!track) return;
  baseQueue = queueIds ? queueIds.slice() : tracks.map(t => t.id);
  currentQueue = isShuffle ? shuffleArray(baseQueue, id) : baseQueue.slice();
  loadAndPlay(track);
}

function loadAndPlay(track) {
  currentTrack = track;
  currentIndex = currentQueue.indexOf(track.id);
  if (currentAudioUrl) URL.revokeObjectURL(currentAudioUrl);
  currentAudioUrl = URL.createObjectURL(track.fileBlob);
  audioEl.src = currentAudioUrl;
  audioEl.play().catch(() => {});
  updateNowPlayingUI();
  updateMediaSession();
  showMiniPlayer();
  renderTrackList(document.getElementById('search-input').value.trim());
}

function togglePlayPause() {
  if (!currentTrack) return;
  if (audioEl.paused) audioEl.play().catch(() => {});
  else audioEl.pause();
}

function playNext() {
  if (currentQueue.length === 0) return;
  let nextIndex = currentIndex + 1;
  if (nextIndex >= currentQueue.length) {
    if (repeatMode === 'all') nextIndex = 0;
    else { audioEl.pause(); return; }
  }
  const track = tracks.find(t => t.id === currentQueue[nextIndex]);
  if (track) loadAndPlay(track);
}

function playPrev() {
  if (currentQueue.length === 0) return;
  if (audioEl.currentTime > 3) { audioEl.currentTime = 0; return; }
  let prevIndex = currentIndex - 1;
  if (prevIndex < 0) {
    if (repeatMode === 'all') prevIndex = currentQueue.length - 1;
    else { audioEl.currentTime = 0; return; }
  }
  const track = tracks.find(t => t.id === currentQueue[prevIndex]);
  if (track) loadAndPlay(track);
}

function toggleShuffle() {
  isShuffle = !isShuffle;
  document.getElementById('btn-shuffle').classList.toggle('active', isShuffle);
  if (!currentTrack) return;
  currentQueue = isShuffle ? shuffleArray(baseQueue, currentTrack.id) : baseQueue.slice();
  currentIndex = currentQueue.indexOf(currentTrack.id);
}

function cycleRepeat() {
  repeatMode = repeatMode === 'off' ? 'all' : repeatMode === 'all' ? 'one' : 'off';
  const btn = document.getElementById('btn-repeat');
  btn.classList.toggle('active', repeatMode !== 'off');
  btn.textContent = repeatMode === 'one' ? '🔂' : '🔁';
}

function shuffleArray(arr, keepFirst) {
  const rest = arr.filter(id => id !== keepFirst);
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  return keepFirst !== undefined ? [keepFirst, ...rest] : rest;
}

// ===== Now Playing UI =====
function openNowPlaying() {
  if (!currentTrack) return;
  showView('view-nowplaying');
}

function updateNowPlayingUI() {
  if (!currentTrack) return;
  document.getElementById('np-artwork').src = getArtworkUrl(currentTrack);
  document.getElementById('np-title').textContent = currentTrack.title;
  document.getElementById('np-artist').textContent = currentTrack.artist;
  document.getElementById('mini-artwork').src = getArtworkUrl(currentTrack);
  document.getElementById('mini-title').textContent = currentTrack.title;
  document.getElementById('mini-artist').textContent = currentTrack.artist;
  updateLyricsPane();
}

function showMiniPlayer() {
  document.getElementById('mini-player').classList.remove('hidden');
}

function bindAudioEvents() {
  audioEl.addEventListener('play', () => setPlayPauseIcon(true));
  audioEl.addEventListener('pause', () => setPlayPauseIcon(false));
  audioEl.addEventListener('ended', () => {
    if (repeatMode === 'one') {
      audioEl.currentTime = 0;
      audioEl.play().catch(() => {});
      return;
    }
    playNext();
  });
  audioEl.addEventListener('timeupdate', () => {
    highlightCurrentLyricLine();
    if (seeking || !audioEl.duration) return;
    document.getElementById('seek-bar').value = (audioEl.currentTime / audioEl.duration) * 1000;
    document.getElementById('np-current-time').textContent = formatTime(audioEl.currentTime);
    if ('mediaSession' in navigator && navigator.mediaSession.setPositionState) {
      try {
        navigator.mediaSession.setPositionState({
          duration: audioEl.duration || 0,
          playbackRate: audioEl.playbackRate,
          position: audioEl.currentTime,
        });
      } catch (e) {}
    }
  });
  audioEl.addEventListener('loadedmetadata', () => {
    document.getElementById('np-duration').textContent = formatTime(audioEl.duration);
  });
}

function setPlayPauseIcon(playing) {
  const icon = playing ? '⏸' : '▶️';
  document.getElementById('btn-playpause').textContent = icon;
  document.getElementById('mini-playpause').textContent = icon;
}

function formatTime(sec) {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

// ===== 歌詞 =====
let lastActiveLyricIdx = -1;

function toggleLyrics() {
  const pane = document.getElementById('np-lyrics');
  pane.classList.toggle('hidden');
  if (!pane.classList.contains('hidden')) { lastActiveLyricIdx = -1; updateLyricsPane(); }
}

function updateLyricsPane() {
  const pane = document.getElementById('np-lyrics');
  if (pane.classList.contains('hidden')) return;
  pane.innerHTML = '';
  pane.onclick = null;

  if (currentTrack.syncedLyrics && currentTrack.syncedLyrics.length > 0) {
    currentTrack.syncedLyrics.forEach((line) => {
      const div = document.createElement('div');
      div.className = 'lyric-line';
      div.textContent = line.text || '♪';
      div.addEventListener('click', () => { audioEl.currentTime = line.time; });
      pane.appendChild(div);
    });
    lastActiveLyricIdx = -1;
    highlightCurrentLyricLine();
  } else if (currentTrack.lyrics) {
    const div = document.createElement('div');
    div.style.whiteSpace = 'pre-wrap';
    div.textContent = currentTrack.lyrics;
    pane.appendChild(div);
  } else {
    pane.textContent = '歌詞が登録されていません。タップして入力';
    pane.onclick = async () => {
      const text = prompt('歌詞を入力してください', '');
      if (text === null) return;
      currentTrack.lyrics = text;
      currentTrack.syncedLyrics = null;
      await DB.updateTrack(currentTrack);
      updateLyricsPane();
    };
  }
}

// 再生位置に合わせて現在の行をハイライト+自動スクロール(timeupdateから呼ばれる)
function highlightCurrentLyricLine() {
  const pane = document.getElementById('np-lyrics');
  if (pane.classList.contains('hidden')) return;
  if (!currentTrack || !currentTrack.syncedLyrics || currentTrack.syncedLyrics.length === 0) return;

  const t = audioEl.currentTime;
  const lines = currentTrack.syncedLyrics;
  let activeIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].time <= t) activeIdx = i;
    else break;
  }
  if (activeIdx === lastActiveLyricIdx) return;
  lastActiveLyricIdx = activeIdx;

  const lineEls = pane.querySelectorAll('.lyric-line');
  lineEls.forEach((el, idx) => el.classList.toggle('active', idx === activeIdx));
  if (activeIdx >= 0 && lineEls[activeIdx]) {
    lineEls[activeIdx].scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
}

// ===== Media Session (ロック画面 / バックグラウンド再生コントロール) =====
function updateMediaSession() {
  if (!('mediaSession' in navigator) || !currentTrack) return;
  const artwork = [];
  if (currentTrack.artworkBlob) {
    artwork.push({ src: getArtworkUrl(currentTrack), sizes: '512x512', type: currentTrack.artworkBlob.type || 'image/jpeg' });
  }
  navigator.mediaSession.metadata = new MediaMetadata({
    title: currentTrack.title,
    artist: currentTrack.artist,
    album: currentTrack.album || '',
    artwork,
  });
  navigator.mediaSession.setActionHandler('play', () => audioEl.play().catch(() => {}));
  navigator.mediaSession.setActionHandler('pause', () => audioEl.pause());
  navigator.mediaSession.setActionHandler('previoustrack', playPrev);
  navigator.mediaSession.setActionHandler('nexttrack', playNext);
  try {
    navigator.mediaSession.setActionHandler('seekto', (details) => {
      if (details.seekTime != null) audioEl.currentTime = details.seekTime;
    });
  } catch (e) {}
}

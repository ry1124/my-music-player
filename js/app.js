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
let lastGroupListView = 'view-years'; // 年代/ジャンル詳細画面から「戻る」時にどちらに戻るか
const artworkUrlCache = new Map(); // trackId -> objectURL

const audioEl = document.getElementById('audio-el');

// ===== 初期化 =====
window.addEventListener('DOMContentLoaded', async () => {
  registerServiceWorker();
  document.getElementById('app-version').textContent = APP_VERSION;
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
  const TAB_VIEW_MAP = {
    library: 'view-library',
    years: 'view-years',
    genres: 'view-genres',
    artists: 'view-artists',
    playlists: 'view-playlists',
  };
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const tab = btn.dataset.tab;
      if (tab === 'years') renderYearList();
      else if (tab === 'genres') renderGenreList();
      else if (tab === 'artists') renderArtistList();
      showView(TAB_VIEW_MAP[tab] || 'view-library');
    });
  });

  document.getElementById('btn-add').addEventListener('click', () => {
    document.getElementById('file-input').click();
  });
  document.getElementById('file-input').addEventListener('change', (e) => {
    // 選択画面ではiOSが音楽ファイルを絞り込めない場合があるため、ここで拡張子/MIMEで判定する
    const audioFiles = Array.from(e.target.files).filter(
      (f) => f.type.startsWith('audio/') || /\.(mp3|m4a|aac|flac|wav|aiff?|alac|ogg|opus|caf|mp4)$/i.test(f.name)
    );
    if (audioFiles.length === 0 && e.target.files.length > 0) {
      alert('音楽ファイル(mp3/m4a/flac/wav等)が選択されていません');
    }
    handleFilesSelected(audioFiles);
    e.target.value = '';
  });

  // PCブラウザでの利用向け: ドラッグ&ドロップで曲を追加
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files).filter(
      (f) => f.type.startsWith('audio/') || /\.(mp3|m4a|aac|flac|wav|aiff?|alac|ogg|opus|caf)$/i.test(f.name)
    );
    if (files.length > 0) handleFilesSelected(files);
  });

  document.getElementById('btn-import-lyrics').addEventListener('click', () => {
    document.getElementById('lyrics-file-input').click();
  });
  document.getElementById('lyrics-file-input').addEventListener('change', (e) => {
    handleLyricsFilesSelected(e.target.files);
    e.target.value = '';
  });

  document.getElementById('btn-auto-lyrics').addEventListener('click', autoFetchLyrics);
  document.getElementById('btn-rescan-tags').addEventListener('click', rescanYearGenreTags);
  document.getElementById('btn-year-sort').addEventListener('click', () => {
    yearSortOrder = yearSortOrder === 'desc' ? 'asc' : 'desc';
    document.getElementById('btn-year-sort').textContent = yearSortOrder === 'desc' ? '新→古' : '古→新';
    renderYearList();
  });
  document.getElementById('btn-back-group').addEventListener('click', () => {
    // ジャンルの曲一覧から戻るときは、まずアルバム一覧へ戻る
    if (lastGroupListView === 'view-genres' && genreCtx && genreCtx.album !== null) {
      renderGenreAlbumList(genreCtx.genre, genreCtx.tracks);
      return;
    }
    showView(lastGroupListView);
  });

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
    const tab = document.querySelector('.tab-btn.active').dataset.tab;
    const map = { library: 'view-library', years: 'view-years', genres: 'view-genres', artists: 'view-artists', playlists: 'view-playlists' };
    showView(map[tab] || 'view-library');
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

// "1993-05-01" や "(17)Rock" のような表記から、年(4桁)/ジャンル名だけを取り出す
function extractYear(tags) {
  if (!tags) return '';
  // jsmediatagsはID3v2.3のTYERだけを year にする。v2.4のTDRC等はフレーム名のまま入っている
  const frameData = (f) => (f && f.data !== undefined ? f.data : '');
  const raw = tags.year || frameData(tags.TDRC) || frameData(tags.TDOR) || frameData(tags.TDRL) || frameData(tags.TORY);
  if (!raw) return '';
  const m = String(raw).match(/\d{4}/);
  return m ? m[0] : '';
}

function extractGenre(tags) {
  const raw = tags && tags.genre;
  if (!raw) return '';
  return String(raw).replace(/^\(\d+\)/, '').trim();
}

const UNKNOWN_ARTIST = '不明なアーティスト';

// タグに情報が無い場合の保険: ファイル名「アーティスト - 曲名」から推定する
function parseFileName(fileName) {
  const base = fileName.replace(/\.[^/.]+$/, '');
  const m = base.match(/^(.+?)\s*[-－―–]\s*(.+)$/);
  if (!m) return { artist: '', title: base };
  return { artist: m[1].trim(), title: m[2].trim() };
}

async function importOneFile(file, sourceKey, orderHint) {
  const tags = await readTags(file);
  const duration = await getAudioDuration(file);
  const artworkBlob = pictureToBlob(tags.picture);
  const lyrics = extractLyrics(tags);
  const fromName = parseFileName(file.name);
  const hasArtistTag = !!(tags.artist && tags.artist.trim());
  const track = {
    title: (tags.title && tags.title.trim()) || (hasArtistTag ? file.name.replace(/\.[^/.]+$/, '') : fromName.title),
    artist: (hasArtistTag && tags.artist.trim()) || fromName.artist || UNKNOWN_ARTIST,
    album: (tags.album && tags.album.trim()) || '',
    year: extractYear(tags),
    genre: extractGenre(tags),
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
  const failures = [];
  tagReadErrors = [];
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
        failures.push(`${file.name}(${err && err.message ? err.message : err})`);
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
  alert(`取り込み完了: 新規${addedCount}曲を追加、${skippedCount}曲は追加済みのためスキップ(所要${timeText})` +
    (failures.length > 0 ? `\n\n失敗${failures.length}件:\n${failures.slice(0, 5).join('\n')}` : '') +
    (tagReadErrors.length > 0 ? `\n\nタグ情報を取得できなかった曲${tagReadErrors.length}件:\n${tagReadErrors.slice(0, 3).join('\n')}` : ''));
}

// タグ読み取りに失敗した理由(診断用)。取り込み完了ダイアログに表示する
let tagReadErrors = [];

function readTags(file) {
  return new Promise((resolve) => {
    if (typeof jsmediatags === 'undefined') {
      tagReadErrors.push(`${file.name}: タグ読取ライブラリ(jsmediatags)が読み込めていません`);
      resolve({});
      return;
    }
    jsmediatags.read(file, {
      onSuccess: (tag) => {
        const tags = tag.tags || {};
        if (!tags.title && !tags.artist && !tags.album) {
          tagReadErrors.push(`${file.name}: タグ形式=${tag.type || '不明'}だが中身が空(ファイルにタグ情報が無い可能性)`);
        }
        resolve(tags);
      },
      onError: (err) => {
        const reason = err && (err.type ? `${err.type}${err.info ? ':' + err.info : ''}` : err.message);
        tagReadErrors.push(`${file.name}: 読取エラー(${reason || '不明'})`);
        resolve({});
      },
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

// ===== 年代・ジャンル情報の再スキャン(既存曲にyear/genreを補完) =====
let isRescanningTags = false;

async function rescanYearGenreTags() {
  if (isRescanningTags) { alert('すでに実行中です'); return; }
  const targets = tracks.filter(t => !t.year || !t.genre || t.artist === UNKNOWN_ARTIST);
  if (targets.length === 0) { alert('すべての曲にタグ情報があります(または元々タグが無く再取得できません)'); return; }
  if (!confirm(`${targets.length}曲のアーティスト・年代・ジャンル情報を再スキャンします。曲数によっては数分かかることがあります。始めますか?`)) return;

  isRescanningTags = true;
  const progressEl = document.getElementById('import-progress');
  progressEl.classList.remove('hidden');
  let updated = 0;

  for (let i = 0; i < targets.length; i += IMPORT_CONCURRENCY) {
    const chunk = targets.slice(i, i + IMPORT_CONCURRENCY);
    progressEl.textContent = `年代・ジャンルを再スキャン中... ${Math.min(i + IMPORT_CONCURRENCY, targets.length)}/${targets.length}曲`;
    await Promise.all(chunk.map(async (track) => {
      try {
        const tags = await readTags(track.fileBlob);
        const year = extractYear(tags);
        const genre = extractGenre(tags);
        let changed = false;
        if (year && !track.year) { track.year = year; changed = true; }
        if (genre && !track.genre) { track.genre = genre; changed = true; }
        if (track.artist === UNKNOWN_ARTIST) {
          const tagArtist = tags.artist && tags.artist.trim();
          const nameArtist = parseFileName(track.fileBlob.name || '').artist;
          const artist = tagArtist || nameArtist;
          if (artist) {
            track.artist = artist;
            changed = true;
          }
        }
        if (changed) {
          await DB.updateTrack(track);
          updated++;
        }
      } catch (err) {
        console.error('再スキャン失敗:', track.title, err);
      }
    }));
  }

  isRescanningTags = false;
  progressEl.classList.add('hidden');
  alert(`再スキャン完了: ${updated}/${targets.length}曲に年代・ジャンル情報を補完しました`);
}

// ===== 年代別・ジャンル別グルーピング =====
let yearSortOrder = 'desc'; // 'desc'=新しい順(デフォルト) / 'asc'=古い順

function yearLabel(track) {
  if (!track.year) return '不明';
  const y = parseInt(track.year, 10);
  if (isNaN(y)) return '不明';
  return `${y}年`;
}

function yearSortFn(a, b) {
  if (a === '不明') return 1;
  if (b === '不明') return -1;
  const ya = parseInt(a, 10);
  const yb = parseInt(b, 10);
  return yearSortOrder === 'desc' ? yb - ya : ya - yb;
}

function genreLabel(track) {
  return track.genre && track.genre.trim() ? track.genre.trim() : '不明';
}

function defaultLabelSort(a, b) {
  if (a === '不明') return 1;
  if (b === '不明') return -1;
  return a.localeCompare(b, 'ja');
}

function renderGroupList(listElId, groupFn, sortFn) {
  const listEl = document.getElementById(listElId);
  listEl.innerHTML = '';
  const groups = new Map(); // label -> track[]
  tracks.forEach((t) => {
    const label = groupFn(t);
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(t);
  });
  const sortedLabels = [...groups.keys()].sort(sortFn || defaultLabelSort);
  sortedLabels.forEach((label) => {
    const groupTracks = groups.get(label);
    const li = document.createElement('li');
    li.className = 'playlist-item';
    const img = document.createElement('img');
    img.className = 'playlist-artwork';
    img.src = getArtworkUrl(groupTracks[0]);
    const meta = document.createElement('div');
    meta.className = 'track-meta';
    const nameEl = document.createElement('div');
    nameEl.className = 'playlist-name';
    nameEl.textContent = label;
    const countEl = document.createElement('div');
    countEl.className = 'playlist-count';
    countEl.textContent = `${groupTracks.length}曲`;
    meta.appendChild(nameEl);
    meta.appendChild(countEl);
    li.appendChild(img);
    li.appendChild(meta);
    const backView = { 'year-list': 'view-years', 'genre-list': 'view-genres', 'artist-list': 'view-artists' }[listElId];
    li.addEventListener('click', () => openGroupDetail(label, groupTracks, backView));
    listEl.appendChild(li);
  });
}

function renderYearList() { renderGroupList('year-list', yearLabel, yearSortFn); }
function renderGenreList() { renderGroupList('genre-list', genreLabel); }

function artistLabel(track) {
  return track.artist && track.artist.trim() && track.artist !== UNKNOWN_ARTIST ? track.artist.trim() : '不明';
}
function renderArtistList() { renderGroupList('artist-list', artistLabel); }

function openGroupDetail(label, groupTracks, backView) {
  lastGroupListView = backView;
  document.getElementById('group-detail-title').textContent = label;

  const filterEl = document.getElementById('group-genre-filter');
  const regionEl = document.getElementById('group-region-filter');
  if (backView === 'view-years') {
    renderGenreSubFilter(groupTracks); // 内部で一覧も描画する
    filterEl.classList.remove('hidden');
    regionEl.classList.remove('hidden');
  } else if (backView === 'view-genres') {
    filterEl.classList.add('hidden');
    regionEl.classList.add('hidden');
    renderGenreAlbumList(label, groupTracks);
  } else {
    filterEl.classList.add('hidden');
    regionEl.classList.add('hidden');
    renderGroupDetailList(groupTracks);
  }
  showView('view-group-detail');
}

function renderGroupDetailList(list) {
  const listEl = document.getElementById('group-detail-list');
  listEl.innerHTML = '';
  const ids = list.map(t => t.id);
  list.forEach((track) => {
    listEl.appendChild(buildTrackItem(track, ids));
  });
}

// ジャンル詳細画面専用: ジャンル → アルバム一覧 → 曲 の3段階。先頭の「すべての曲」でジャンル内の全曲を連続再生できる
let genreCtx = null; // { genre, tracks, album }  album===null ならアルバム一覧を表示中

function albumLabel(track) {
  return track.album && track.album.trim() ? track.album.trim() : 'アルバム不明';
}

function renderGenreAlbumList(genre, groupTracks) {
  genreCtx = { genre, tracks: groupTracks, album: null };
  document.getElementById('group-detail-title').textContent = genre;
  const listEl = document.getElementById('group-detail-list');
  listEl.innerHTML = '';
  const groups = new Map();
  groupTracks.forEach((t) => {
    const a = albumLabel(t);
    if (!groups.has(a)) groups.set(a, []);
    groups.get(a).push(t);
  });
  const albums = [...groups.keys()].sort((a, b) => {
    if (a === 'アルバム不明') return 1;
    if (b === 'アルバム不明') return -1;
    return a.localeCompare(b, 'ja');
  });
  const addRow = (name, list, onClick) => {
    const li = document.createElement('li');
    li.className = 'playlist-item';
    const img = document.createElement('img');
    img.className = 'playlist-artwork';
    img.src = getArtworkUrl(list.find(t => t.artworkBlob) || list[0]);
    const meta = document.createElement('div');
    meta.className = 'track-meta';
    const nameEl = document.createElement('div');
    nameEl.className = 'playlist-name';
    nameEl.textContent = name;
    const countEl = document.createElement('div');
    countEl.className = 'playlist-count';
    countEl.textContent = `${list.length}曲`;
    meta.appendChild(nameEl);
    meta.appendChild(countEl);
    li.appendChild(img);
    li.appendChild(meta);
    li.addEventListener('click', onClick);
    listEl.appendChild(li);
  };
  addRow('すべての曲', groupTracks, () => openGenreAlbumTracks('すべての曲', groupTracks));
  albums.forEach((a) => addRow(a, groups.get(a), () => openGenreAlbumTracks(a, groups.get(a))));
}

function openGenreAlbumTracks(albumName, list) {
  genreCtx.album = albumName;
  document.getElementById('group-detail-title').textContent = `${genreCtx.genre} › ${albumName}`;
  renderGroupDetailList(list);
}

// 年代詳細画面専用: 「Jポップ / 洋楽」→ ジャンル の順で曲を絞り込むチップ(ジャンル別タブとは別物)
// 判定はジャンルタグだけで行う: 「J-Pop(Jポップ/jぽっぷ)」タグ → Jポップ、「洋楽」タグ → 洋楽。それ以外は「すべて」でのみ表示
function originLabel(track) {
  const g = (track.genre || '').normalize('NFKC').trim().toLowerCase();
  if (/^j[-\s]?(pop|ぽっぷ|ポップ)$/.test(g)) return 'J-Pop';
  if (/^(洋楽|ようがく|western)$/.test(g)) return '洋楽';
  return '';
}

function renderGenreSubFilter(groupTracks) {
  const regionEl = document.getElementById('group-region-filter');
  const filterEl = document.getElementById('group-genre-filter');
  let region = 'すべて';
  let genre = 'すべて';

  const byRegion = () => groupTracks.filter(t => region === 'すべて' || originLabel(t) === region);
  const currentList = () => byRegion().filter(t => genre === 'すべて' || genreLabel(t) === genre);
  const makeChip = (text, active, onClick) => {
    const chip = document.createElement('div');
    chip.className = 'filter-chip' + (active ? ' active' : '');
    chip.textContent = text;
    chip.addEventListener('click', onClick);
    return chip;
  };

  const render = () => {
    regionEl.innerHTML = '';
    ['すべて', 'J-Pop', '洋楽'].forEach((r) => {
      const n = r === 'すべて' ? groupTracks.length : groupTracks.filter(t => originLabel(t) === r).length;
      regionEl.appendChild(makeChip(`${r} (${n})`, region === r, () => { region = r; genre = 'すべて'; render(); }));
    });

    filterEl.innerHTML = '';
    const base = byRegion();
    const genres = [...new Set(base.map(t => genreLabel(t)))].sort((a, b) => {
      if (a === '不明') return 1;
      if (b === '不明') return -1;
      return a.localeCompare(b, 'ja');
    });
    filterEl.appendChild(makeChip(`全ジャンル (${base.length})`, genre === 'すべて', () => { genre = 'すべて'; render(); }));
    genres.forEach((g) => {
      const n = base.filter(t => genreLabel(t) === g).length;
      filterEl.appendChild(makeChip(`${g} (${n})`, genre === g, () => { genre = g; render(); }));
    });
    renderGroupDetailList(currentList());
  };
  render();
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
    const timer = setTimeout(() => cleanup(0), 5000); // iOSでメタデータ読込が完了しない場合の保険
    const cleanup = (val) => { clearTimeout(timer); URL.revokeObjectURL(url); resolve(val); };
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
  li.dataset.trackId = track.id;

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
// 画面下からせり上がる選択メニュー。選んだ項目の番号を返す(キャンセルは -1)
function showChoiceSheet(title, options) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'sheet-overlay';
    const sheet = document.createElement('div');
    sheet.className = 'sheet';
    const close = (idx) => { overlay.remove(); resolve(idx); };
    if (title) {
      const t = document.createElement('div');
      t.className = 'sheet-title';
      t.textContent = title;
      sheet.appendChild(t);
    }
    const list = document.createElement('div');
    list.className = 'sheet-list';
    options.forEach((label, i) => {
      const b = document.createElement('button');
      b.className = 'sheet-btn' + (/削除/.test(label) ? ' danger' : '');
      b.textContent = label;
      b.addEventListener('click', () => close(i));
      list.appendChild(b);
    });
    sheet.appendChild(list);
    const cancel = document.createElement('button');
    cancel.className = 'sheet-btn cancel';
    cancel.textContent = 'キャンセル';
    cancel.addEventListener('click', () => close(-1));
    sheet.appendChild(cancel);
    overlay.appendChild(sheet);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(-1); });
    document.body.appendChild(overlay);
  });
}

async function openTrackActionSheet(track) {
  const options = ['プレイリストに追加', '歌詞ファイルを読み込む'];
  if (currentPlaylistId !== null) options.push('このプレイリストから削除');
  options.push('ライブラリから削除');
  const idx = await showChoiceSheet(track.title, options);
  if (idx < 0) return;
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
  const idx = await showChoiceSheet('追加先のプレイリスト', playlists.map(p => p.name));
  if (idx < 0) return;
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
  refreshPlayingHighlight();
}

// 全ての曲一覧(ライブラリ/年代/ジャンル/アーティスト/プレイリスト詳細)で再生中の曲だけ強調する
function refreshPlayingHighlight() {
  const playingId = currentTrack ? String(currentTrack.id) : null;
  document.querySelectorAll('.track-item').forEach((el) => {
    el.classList.toggle('playing', el.dataset.trackId === playingId);
  });
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
  // 歌詞がある曲は既定で歌詞を表示、無い曲はジャケット表示に戻す
  const hasLyrics = !!(currentTrack.lyrics || (currentTrack.syncedLyrics && currentTrack.syncedLyrics.length > 0));
  document.getElementById('np-lyrics').classList.toggle('hidden', !hasLyrics);
  lastActiveLyricIdx = -1;
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

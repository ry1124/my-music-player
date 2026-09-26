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
const artworkUrlCache = new Map(); // trackId -> objectURL(元のジャケット画像)
const thumbMap = new Map();        // trackId -> 一覧用の小さなジャケット画像(Blob)
const thumbUrlCache = new Map();   // trackId -> objectURL(サムネイル)

const audioEl = document.getElementById('audio-el');

// ===== アイコン(単色SVG。currentColor で色を変える) =====
const svgIcon = (path, size) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="currentColor" aria-hidden="true">${path}</svg>`;
const ICON_PATHS = {
  play: '<path d="M8 5v14l11-7z"/>',
  pause: '<path d="M6 5h4v14H6zM14 5h4v14h-4z"/>',
  next: '<path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/>',
  prev: '<path d="M6 6h2v12H6zm3.5 6l8.5 6V6l-8.5 6z"/>',
  shuffle: '<path d="M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z"/>',
  repeat: '<path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/>',
  repeatOne: '<path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4zm-4-2V9h-1l-2 1v1h1.5v4h1.5z"/>',
  lyrics: '<path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z"/>',
  tabLibrary: '<path d="M20 2H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 5h-3v5.5c0 1.38-1.12 2.5-2.5 2.5S10 13.88 10 12.5s1.12-2.5 2.5-2.5c.57 0 1.08.19 1.5.51V5h4v2zM4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6z"/>',
  tabYears: '<path d="M17 12h-5v5h5v-5zM16 1v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2h-1V1h-2zm3 18H5V8h14v11z"/>',
  tabGenres: '<path d="M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3V8h3V6h-5z"/>',
  tabArtists: '<path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z"/>',
  tabPlaylists: '<path d="M19 9H2v2h17V9zm0-4H2v2h17V5zM2 15h13v-2H2v2zm15-2v6l5-3-5-3z"/>',
  heart: '<path d="M22 9.24l-7.19-.62L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21 12 17.27 18.18 21l-1.63-7.03L22 9.24zM12 15.4l-3.76 2.27 1-4.28-3.32-2.88 4.38-.38L12 6.1l1.71 4.04 4.38.38-3.32 2.88 1 4.28L12 15.4z"/>',
  heartFilled: '<path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>',
  tag: '<path d="M17.63 5.84C17.27 5.33 16.67 5 16 5L5 5.01C3.9 5.01 3 5.9 3 7v10c0 1.1.9 1.99 2 1.99L16 19c.67 0 1.27-.33 1.63-.84L22 12l-4.37-6.16z"/>',
  search: '<path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>',
  doc: '<path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/>',
  add: '<path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>',
};

function setupIcons() {
  const set = (id, key, size) => { document.getElementById(id).innerHTML = svgIcon(ICON_PATHS[key], size); };
  set('btn-prev', 'prev', 38);
  set('btn-next', 'next', 38);
  set('btn-playpause', 'play', 64);
  set('btn-shuffle', 'shuffle', 24);
  set('btn-repeat', 'repeat', 24);
  set('btn-lyrics-toggle', 'lyrics', 24);
  set('mini-playpause', 'play', 28);
  set('mini-next', 'next', 28);
  // タブバー・上部ボタンも単色アイコンにする(白い画面でカラー絵文字が浮かないように)
  const tabIcons = { library: 'tabLibrary', years: 'tabYears', genres: 'tabGenres', artists: 'tabArtists', playlists: 'tabPlaylists' };
  Object.entries(tabIcons).forEach(([tab, key]) => {
    document.querySelector(`.tab-btn[data-tab="${tab}"] .tab-icon`).innerHTML = svgIcon(ICON_PATHS[key], 24);
  });
  set('btn-rescan-tags', 'tag', 22);
  set('btn-auto-lyrics', 'search', 22);
  set('btn-import-lyrics', 'doc', 22);
  set('btn-add', 'add', 26);
  set('btn-new-playlist', 'add', 26);
}

// ===== 初期化 =====
window.addEventListener('DOMContentLoaded', async () => {
  registerServiceWorker();
  document.getElementById('app-version').textContent = APP_VERSION;
  tracks = await DB.getAllTracks();
  (await DB.getAllThumbs()).forEach((blob, id) => thumbMap.set(id, blob));
  playlists = await DB.getAllPlaylists();
  renderTrackList();
  renderPlaylistList();
  setTimeout(migrateThumbs, 1500); // 起動が落ち着いてから、足りないサムネイルを裏で作る
  setTimeout(prerenderGroupLists, 2000); // 起動が落ち着いてから、年代/ジャンル/アーティストの一覧を先に作る
  setupIcons();
  setupIndexBar();
  showView('view-library'); // 起動直後の画面でもインデックスバーの表示状態を反映
  bindUIEvents();
  bindAudioEvents();
});

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('service-worker.js').catch(() => {});
  }
}

// ===== タブ切り替え =====
let viewBeforeNowPlaying = 'view-library';
function showView(id) {
  const prev = document.querySelector('.view.active');
  if (id === 'view-nowplaying' && prev && prev.id !== 'view-nowplaying') viewBeforeNowPlaying = prev.id; // 閉じたときに戻る画面
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  document.body.classList.toggle('np-open', id === 'view-nowplaying'); // 再生画面ではミニプレイヤー/タブバーを隠す
  if (id === 'view-playlists' && playlistListDirty) renderPlaylistList();
  refreshIndexTarget();
  document.getElementById(id).querySelectorAll('ul').forEach(ul => { if (ul._v) updateVirtualWindow(ul, false); });
}

// 右端のインデックスバーを出すか・どの一覧を対象にするかを、今の画面の状態から決める
function refreshIndexTarget() {
  const active = document.querySelector('.view.active');
  if (!active) return;
  let listId = INDEX_VIEWS[active.id] || null;
  if (active.id === 'view-group-detail' && (lastGroupListView === 'view-genres' || lastGroupListView === 'view-years')) {
    // ジャンルの中でアルバム一覧を表示しているときは、アルバム一覧が対象
    listId = (lastGroupListView === 'view-genres' && genreCtx && genreCtx.album === null) ? 'group-albums-list' : 'group-detail-list';
  }
  indexListId = listId;
  document.getElementById('index-bar').classList.toggle('hidden', !listId);
  active.classList.toggle('has-index', !!listId);
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
    document.getElementById('btn-year-sort').textContent = yearSortOrder === 'desc' ? '降順(新→古)' : '昇順(古→新)';
    renderYearList();
  });
  document.getElementById('btn-back-group').addEventListener('click', () => {
    // ジャンルの曲一覧から戻るときは、まずアルバム一覧へ戻る
    if (lastGroupListView === 'view-genres' && genreCtx && genreCtx.album !== null) {
      genreCtx.album = null;
      document.getElementById('group-detail-title').textContent = genreCtx.genre;
      setGroupMode('albums'); // 作り直さず、保持しているアルバム一覧を再表示するだけ
      return;
    }
    showView(lastGroupListView);
  });

  let searchTimer = null;
  document.getElementById('search-input').addEventListener('input', (e) => {
    const value = e.target.value.trim();
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => renderTrackList(value), 200); // 入力が止まってから描画
  });

  document.getElementById('btn-new-playlist').addEventListener('click', createPlaylistPrompt);
  const btnReorder = document.getElementById('btn-reorder-playlist');
  btnReorder.addEventListener('click', () => {
    playlistEditMode = !playlistEditMode;
    btnReorder.textContent = playlistEditMode ? '完了' : '並び替え';
    renderPlaylistList();
  });
  document.getElementById('btn-back-playlists').addEventListener('click', () => showView('view-playlists'));
  document.getElementById('btn-playlist-add').addEventListener('click', openAddSongs);
  document.getElementById('btn-playlist-reorder').addEventListener('click', toggleSongEditMode);
  document.getElementById('playlist-detail-list').addEventListener('pointerdown', (e) => {
    const handle = e.target.closest('.drag-handle');
    const li = handle && handle.closest('.edit-row');
    if (!li) return;
    startRowDrag({ preventDefault: () => e.preventDefault(), currentTarget: handle, pointerId: e.pointerId, clientY: e.clientY }, li, li.parentElement, async (rows) => {
      const pl = playlists.find(p => p.id === currentPlaylistId);
      if (!pl) return;
      const shown = rows.map(r => Number(r.dataset.trackId));
      const missing = pl.trackIds.filter(id => !shown.includes(id)); // 一覧に出なかった曲(削除済み等)は末尾に残す
      pl.trackIds = [...shown, ...missing];
      await DB.updatePlaylist(pl);
    });
  });
  document.getElementById('btn-add-songs-done').addEventListener('click', closeAddSongs);
  let addSongsTimer = null;
  document.getElementById('add-songs-search').addEventListener('input', (e) => {
    const v = e.target.value.trim();
    clearTimeout(addSongsTimer);
    addSongsTimer = setTimeout(() => renderAddSongsList(v), 200);
  });
  document.getElementById('add-songs-list').addEventListener('click', (e) => {
    const li = e.target.closest('.add-row');
    if (li) toggleSongInPlaylist(li.dataset.trackId);
  });
  // ミニプレイヤー
  document.getElementById('mini-player').addEventListener('click', (e) => {
    if (e.target.closest('button')) return;
    openNowPlaying();
  });
  document.getElementById('mini-playpause').addEventListener('click', (e) => { e.stopPropagation(); togglePlayPause(); });
  document.getElementById('mini-next').addEventListener('click', (e) => { e.stopPropagation(); playNext(); });

  // Now Playing
  document.getElementById('btn-collapse-nowplaying').addEventListener('click', () => {
    showView(viewBeforeNowPlaying || 'view-library'); // 再生画面を開く前にいた画面へ戻る
  });
  document.getElementById('btn-playpause').addEventListener('click', togglePlayPause);
  document.getElementById('btn-prev').addEventListener('click', playPrev);
  document.getElementById('btn-next').addEventListener('click', playNext);
  document.getElementById('btn-shuffle').addEventListener('click', toggleShuffle);
  document.getElementById('btn-repeat').addEventListener('click', cycleRepeat);
  document.getElementById('btn-lyrics-toggle').addEventListener('click', toggleLyrics);
  document.getElementById('btn-np-fav').addEventListener('click', () => { if (currentTrack) toggleFavorite(currentTrack); });
  document.getElementById('btn-np-more').addEventListener('click', () => { if (currentTrack) openTrackActionSheet(currentTrack); });

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

// 並び替え用の読み(ID3の TSOT/TSOP/TSOA。ID3v2.2の曲では TST/TSP/TSA)。無ければ空文字
function extractSortName(tags, ...frameIds) {
  if (!tags) return '';
  for (const id of frameIds) {
    const f = tags[id];
    const v = f && (typeof f === 'string' ? f : f.data);
    if (v && String(v).trim()) return String(v).replace(/\u0000/g, '').trim();
  }
  return '';
}

// 曲の並び替え・インデックス用のキー: 読みがあれば読み、無ければ曲名そのもの
const trackSortKey = (t) => t.titleSort || t.title;

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
    titleSort: extractSortName(tags, 'TSOT', 'TST'),
    artistSort: extractSortName(tags, 'TSOP', 'TSP'),
    albumSort: extractSortName(tags, 'TSOA', 'TSA'),
    readingsScanned: true,
    artworkScanned: true,
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
  await saveThumb(track);
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
  markLibraryChanged();
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

// 同じ曲でも、lrclibには長さ(イントロなど)の違う版が複数登録されている。曲の長さが近い版を選ばないと、歌詞のタイミングがずれる
const LYRIC_DURATION_TOLERANCE = 3; // 秒。これ以内なら「同じ版」とみなす
async function fetchLrcFromLrclib(artist, title, duration) {
  const searchUrl = `${LRCLIB_BASE}/search?artist_name=${encodeURIComponent(artist)}&track_name=${encodeURIComponent(title)}`;
  const res = await fetch(searchUrl);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const list = (await res.json()).filter(r => !r.instrumental && (r.syncedLyrics || r.plainLyrics));
  if (list.length === 0) return null;
  const diff = (r) => (duration > 0 && r.duration > 0 ? Math.abs(r.duration - duration) : Infinity);
  // 1) 長さが近く、時刻付きの歌詞がある版 → 2) 長さが近い、時刻なしの歌詞 → 3) それ以外(長さが分からない場合の最後の手段)
  const near = list.filter(r => diff(r) <= LYRIC_DURATION_TOLERANCE).sort((x, y) => diff(x) - diff(y));
  const pick = near.find(r => r.syncedLyrics) || near[0];
  if (pick) return { ...pick, matchedByDuration: true };
  if (duration > 0) {
    // 長さの合う版が無い: 時刻付きの歌詞は使わない(ずれるため)。文字だけの歌詞があれば、それだけ使う
    const plain = list.find(r => r.plainLyrics);
    return plain ? { plainLyrics: plain.plainLyrics, syncedLyrics: null, matchedByDuration: false } : null;
  }
  return list.find(r => r.syncedLyrics) || list[0];
}

// 1曲分の歌詞を検索して、その曲に反映する。反映できたら 'synced' / 'plain'、見つからなければ null
async function applyLyricsFromNet(track, onlyIfMatched = false) {
  const data = await fetchLrcFromLrclib(track.artist, track.title, track.duration);
  if (!data || !(data.syncedLyrics || data.plainLyrics)) return null;
  if (onlyIfMatched && !(data.syncedLyrics && data.matchedByDuration)) return null; // 入れ直しモード: 長さの合う時刻付きの版が見つかったときだけ差し替える
  if (data.syncedLyrics) {
    const synced = parseLrc(data.syncedLyrics);
    track.syncedLyrics = synced.length > 0 ? synced : null;
    track.lyrics = synced.length > 0 ? synced.map(l => l.text).filter(Boolean).join('\n') : data.plainLyrics || '';
  } else {
    track.syncedLyrics = null;
    track.lyrics = data.plainLyrics;
  }
  track.lyricOffset = 0;
  track.lyricsDurationMatched = !!data.matchedByDuration; // 曲の長さに合う版を採用した印(入れ直しの対象から外す)
  await DB.updateTrack(track);
  return track.syncedLyrics ? 'synced' : 'plain';
}

async function autoFetchLyrics() {
  if (isAutoFetchingLyrics) { alert('すでに検索中です'); return; }
  const idx = await showChoiceSheet('歌詞をネットから自動検索', ['歌詞が無い曲を検索', '時刻付き歌詞を、曲の長さに合う版で入れ直す(ずれ直し)']);
  if (idx < 0) return;
  const resync = idx === 1;
  const targets = resync ? tracks.filter(t => t.syncedLyrics && t.syncedLyrics.length > 0 && !t.lyricsDurationMatched) : tracks.filter(t => !t.lyrics);
  if (targets.length === 0) { alert(resync ? '入れ直す対象の曲はありません' : '歌詞が無い曲はありません'); return; }
  const message = resync
    ? `時刻付き歌詞のある${targets.length}曲について、曲の長さに合う版を探して入れ直します。長さの合う版が見つかった曲だけ差し替え、見つからない曲は今のままです(手動で読み込んだ歌詞ファイルも、合う版が見つかれば入れ替わります)。数分〜十数分かかります。アプリを開いたまま待つ必要があります。始めますか?`
    : `歌詞が無い${targets.length}曲をネットで自動検索します。曲数によっては数分〜十数分かかります。アプリを開いたまま待つ必要があります。始めますか?`;
  if (!confirm(message)) return;

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
      const result = await applyLyricsFromNet(track, resync);
      if (result) { found++; if (result === 'synced') syncedCount++; }
      else notFound++;
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
  const targets = tracks.filter(t => !t.readingsScanned || !t.artworkScanned || !t.year || !t.genre || t.artist === UNKNOWN_ARTIST);
  if (targets.length === 0) { alert('すべての曲にタグ情報があります(または元々タグが無く再取得できません)'); return; }
  if (!confirm(`${targets.length}曲のアーティスト・年代・ジャンル・読み(並び替え用)・ジャケット画像を再スキャンします。曲数によっては数分かかることがあります。始めますか?`)) return;

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
        if (!track.readingsScanned) {
          track.titleSort = extractSortName(tags, 'TSOT', 'TST');
          track.artistSort = extractSortName(tags, 'TSOP', 'TSP');
          track.albumSort = extractSortName(tags, 'TSOA', 'TSA');
          track.readingsScanned = true;
          changed = true;
        }
        if (!track.artworkScanned) {
          if (!track.artworkBlob) {
            const art = pictureToBlob(tags.picture);
            if (art) {
              track.artworkBlob = art;
              artworkUrlCache.delete(track.id); // 古い(既定画像の)キャッシュを捨てて、次の描画で新しい画像を使う
              thumbUrlCache.delete(track.id);
            }
          }
          track.artworkScanned = true;
          changed = true;
        }
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
  migrateThumbs(); // 新しく入ったジャケットのサムネイルを裏で作る
  markLibraryChanged();
  renderTrackList(document.getElementById('search-input').value.trim());
  alert(`再スキャン完了: ${updated}/${targets.length}曲のタグ情報(年代・ジャンル・読みなど)を更新しました`);
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

// 特撮ジャンルの曲を、シリーズ(ウルトラマン / 仮面ライダー)にまとめる。アルバム名・曲名・アーティスト名に「ウルトラ」/「仮面」「ライダー」が含まれるかで判定する
const TOKUSATSU_GENRE_RE = /^(特撮|とくさつ|tokusatsu)$/;
const TOKUSATSU_SERIES = [
  { label: 'ウルトラマン', re: /ウルトラ/ },
  { label: '仮面ライダー', re: /仮面|ライダー/ },
];
function isTokusatsu(track) {
  return TOKUSATSU_GENRE_RE.test((track.genre || '').normalize('NFKC').trim().toLowerCase());
}
// 特撮の曲ならシリーズ名、それ以外や判別できない曲は '' を返す
function tokusatsuSeries(track) {
  if (!isTokusatsu(track)) return '';
  const text = `${track.album || ''} ${track.title || ''} ${track.artist || ''}`.normalize('NFKC');
  const hit = TOKUSATSU_SERIES.find(d => d.re.test(text));
  return hit ? hit.label : '';
}

function genreLabel(track) {
  return track.genre && track.genre.trim() ? track.genre.trim() : '不明';
}

function defaultLabelSort(a, b) {
  if (a === '不明') return 1;
  if (b === '不明') return -1;
  return a.localeCompare(b, 'ja');
}

// 曲の追加・削除・再スキャンのたびに増やす。一覧の再利用の可否判定に使う
let libVersion = 0;
let prerenderTimer = null;
function markLibraryChanged() {
  libVersion++;
  clearTimeout(prerenderTimer);
  prerenderTimer = setTimeout(prerenderGroupLists, 800); // 変更のあと、空き時間に一覧を作り直しておく
}

// 年代/ジャンル/アーティストの一覧を、タブが押される前に作っておく(押したときは切り替えるだけで済む)
function prerenderGroupLists() {
  renderYearList();
  renderGenreList();
  renderArtistList();
}

// 「名前 + 曲数 + ジャケット」の行の一覧を、HTML文字列で一括生成する。クリックは一覧全体で1回だけ受ける
// rows: [{ name, count, artUrl, section, onClick }]
function fillGroupRows(listEl, rows) {
  clearTimeout(listEl._renderTimer); // 曲一覧の段階描画が残っていれば止める
  listEl._flushRows = null;
  listEl._rows = rows;
  listEl.innerHTML = rows.map((r, i) =>
    `<li class="playlist-item" data-i="${i}" data-section="${esc(r.section)}">` +
    `<img class="playlist-artwork" loading="lazy" decoding="async" src="${r.artUrl}" alt="">` +
    `<div class="track-meta"><div class="playlist-name">${esc(r.name)}</div><div class="playlist-count">${r.count}曲</div></div></li>`
  ).join('');
  if (listEl._rowsBound) return;
  listEl._rowsBound = true;
  listEl.addEventListener('click', (e) => {
    const li = e.target.closest('.playlist-item');
    if (!li || !listEl.contains(li)) return;
    const row = listEl._rows && listEl._rows[Number(li.dataset.i)];
    if (row) row.onClick();
  });
}

function renderGroupList(listElId, groupFn, sortFn, keyFn, cacheKey = '') {
  const listEl = document.getElementById(listElId);
  const ver = `${libVersion}|${cacheKey}`;
  if (listEl._ver === ver) return; // 曲が変わっていなければ、前回の一覧をそのまま使う
  listEl._ver = ver;
  const groups = new Map(); // label -> track[]
  tracks.forEach((t) => {
    const label = groupFn(t);
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(t);
  });
  const backView = { 'year-list': 'view-years', 'genre-list': 'view-genres', 'artist-list': 'view-artists' }[listElId];
  const rows = [...groups.keys()].sort(sortFn || defaultLabelSort).map((label) => {
    const groupTracks = groups.get(label);
    return {
      name: label,
      count: groupTracks.length,
      artUrl: getThumbUrl(groupTracks.find(t => t.artworkBlob) || groupTracks[0]),
      section: sectionOf(keyFn ? keyFn(label) : label),
      onClick: () => openGroupDetail(label, groupTracks, backView),
    };
  });
  fillGroupRows(listEl, rows);
}

function renderYearList() { renderGroupList('year-list', yearLabel, yearSortFn, null, yearSortOrder); }
function renderGenreList() { renderGroupList('genre-list', genreLabel); }

function artistLabel(track) {
  return track.artist && track.artist.trim() && track.artist !== UNKNOWN_ARTIST ? track.artist.trim() : '不明';
}
function renderArtistList() {
  // アーティストの読み(TSOP)があれば、それで並べる。無ければ表記そのまま
  const reading = new Map();
  tracks.forEach((t) => {
    const l = artistLabel(t);
    if (t.artistSort && !reading.has(l)) reading.set(l, t.artistSort);
  });
  const keyOf = (l) => reading.get(l) || l;
  renderGroupList('artist-list', artistLabel, (a, b) => {
    if (a === '不明') return 1;
    if (b === '不明') return -1;
    return sectionSort(keyOf(a), keyOf(b));
  }, keyOf);
}

function openGroupDetail(label, groupTracks, backView) {
  lastGroupListView = backView;
  document.getElementById('group-detail-title').textContent = label;

  const filterEl = document.getElementById('group-genre-filter');
  const regionEl = document.getElementById('group-region-filter');
  if (backView === 'view-years') {
    filterEl.classList.remove('hidden');
    renderGenreSubFilter(groupTracks); // 内部で一覧も描画する(下の段が空なら非表示にする)
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

// 詳細画面には、アルバム一覧と曲一覧の2つの領域があり、どちらか一方だけを表示する
function setGroupMode(mode) {
  document.getElementById('group-albums-list').classList.toggle('hidden', mode !== 'albums');
  document.getElementById('group-detail-list').classList.toggle('hidden', mode !== 'tracks');
  refreshIndexTarget();
}

function renderGroupDetailList(list) {
  setGroupMode('tracks');
  const listEl = document.getElementById('group-detail-list');
  fillTrackList(listEl, list, list.map(t => t.id));
}

// ジャンル詳細画面専用: ジャンル → アルバム一覧 → 曲 の3段階。先頭の「すべての曲」でジャンル内の全曲を連続再生できる
let genreCtx = null; // { genre, tracks, album }  album===null ならアルバム一覧を表示中

function albumLabel(track) {
  return track.album && track.album.trim() ? track.album.trim() : 'アルバム不明';
}

function renderGenreAlbumList(genre, groupTracks) {
  genreCtx = { genre, tracks: groupTracks, album: null };
  document.getElementById('group-detail-title').textContent = genre;
  setGroupMode('albums');
  const listEl = document.getElementById('group-albums-list');
  const groups = new Map();
  groupTracks.forEach((t) => {
    const a = albumLabel(t);
    if (!groups.has(a)) groups.set(a, []);
    groups.get(a).push(t);
  });
  const reading = new Map(); // アルバム名 → 読み(TSOA)。あれば読みで並べる
  groupTracks.forEach((t) => { const a = albumLabel(t); if (t.albumSort && !reading.has(a)) reading.set(a, t.albumSort); });
  const keyOf = (a) => reading.get(a) || a;
  const albums = [...groups.keys()].sort((a, b) => {
    if (a === 'アルバム不明') return 1;
    if (b === 'アルバム不明') return -1;
    return sectionSort(keyOf(a), keyOf(b));
  });
  const toRow = (name, list, onClick) => ({
    name,
    count: list.length,
    artUrl: getThumbUrl(list.find(t => t.artworkBlob) || list[0]),
    section: sectionOf(keyOf(name)),
    onClick,
  });
  // 特撮ジャンルなら、アルバム一覧の前に「ウルトラマン」「仮面ライダー」の行を出す
  const seriesRows = [];
  if (groupTracks.some(isTokusatsu)) {
    TOKUSATSU_SERIES.forEach((d) => {
      const list = groupTracks.filter(t => tokusatsuSeries(t) === d.label);
      if (list.length > 0) seriesRows.push(toRow(d.label, list, () => openGenreAlbumTracks(d.label, list)));
    });
  }
  fillGroupRows(listEl, [
    toRow('すべての曲', groupTracks, () => openGenreAlbumTracks('すべての曲', groupTracks)),
    ...seriesRows,
    ...albums.map(a => toRow(a, groups.get(a), () => openGenreAlbumTracks(a, groups.get(a)))),
  ]);
}

function openGenreAlbumTracks(albumName, list) {
  list = list.slice().sort((a, b) => sectionSort(trackSortKey(a), trackSortKey(b)));
  genreCtx.album = albumName;
  document.getElementById('group-detail-title').textContent = `${genreCtx.genre} › ${albumName}`;
  renderGroupDetailList(list);
}

// 年代詳細画面専用: 「J-Pop / Anime / 洋楽」→ ジャンル(特撮・ボカロ等は下の段のジャンルで選ぶ) の順で曲を絞り込むチップ(ジャンル別タブとは別物)
// 判定はジャンルタグだけで行う。チップの表記は、ライブラリ内でそのジャンルに実際に付いているタグの表記(最多のもの)を使う
const ORIGIN_DEFS = [
  { key: 'jpop', label: 'J-Pop', re: /^j[-\s]?(pop|ぽっぷ|ポップ)$/ },
  { key: 'anime', label: 'Anime', re: /^(アニメ|あにめ|anime)$/ },
  { key: 'western', label: '洋楽', re: /^(洋楽|ようがく|western)$/ },
];

function originKey(track) {
  const g = (track.genre || '').normalize('NFKC').trim().toLowerCase();
  const def = ORIGIN_DEFS.find(d => d.re.test(g));
  return def ? def.key : '';
}

// そのジャンルに実際に付いているタグ表記(最多)。ライブラリに1曲も無ければ既定の表記
function originDisplayLabel(def) {
  const counts = new Map();
  tracks.forEach((t) => {
    if (originKey(t) === def.key) {
      const raw = t.genre.trim();
      counts.set(raw, (counts.get(raw) || 0) + 1);
    }
  });
  if (counts.size === 0) return def.label;
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

// 複数選択可: 上の段(J-Pop/Anime/洋楽)と下の段(それ以外のジャンル)で選んだ項目のどれかに当てはまる曲を表示する。何も選ばなければ全曲
function renderGenreSubFilter(groupTracks) {
  const regionEl = document.getElementById('group-region-filter');
  const filterEl = document.getElementById('group-genre-filter');
  const selOrigins = new Set(); // 選択中の上の段(key)
  const selGenres = new Set();  // 選択中の下の段(ジャンル名)

  // 下の段のチップ名。特撮は「ウルトラマン」「仮面ライダー」に分け、判別できない曲は元のジャンル名(特撮)のまま
  const chipGenre = (t) => tokusatsuSeries(t) || genreLabel(t);
  const noSelection = () => selOrigins.size === 0 && selGenres.size === 0;
  const isSelected = (t) => {
    const k = originKey(t);
    return k ? selOrigins.has(k) : selGenres.has(chipGenre(t));
  };
  // インデックスで飛べるように、曲名(読みがあれば読み)順に並べる
  const currentList = () => (noSelection() ? groupTracks : groupTracks.filter(isSelected))
    .slice().sort((a, b) => sectionSort(trackSortKey(a), trackSortKey(b)));
  const toggle = (set, v) => { if (set.has(v)) set.delete(v); else set.add(v); };
  const makeChip = (text, active, onClick) => {
    const chip = document.createElement('div');
    chip.className = 'filter-chip' + (active ? ' active' : '');
    chip.textContent = text;
    chip.addEventListener('click', onClick);
    return chip;
  };

  const render = () => {
    regionEl.innerHTML = '';
    regionEl.appendChild(makeChip(`すべて (${groupTracks.length})`, noSelection(), () => {
      selOrigins.clear(); selGenres.clear(); render();
    }));
    ORIGIN_DEFS.forEach((d) => {
      const n = groupTracks.filter(t => originKey(t) === d.key).length;
      regionEl.appendChild(makeChip(`${originDisplayLabel(d)} (${n})`, selOrigins.has(d.key), () => { toggle(selOrigins, d.key); render(); }));
    });

    // 上の段(J-Pop/Anime/洋楽)にあるジャンルは、下の段では重複するので出さない
    filterEl.innerHTML = '';
    const genres = [...new Set(groupTracks.filter(t => !originKey(t)).map(t => chipGenre(t)))].sort((a, b) => {
      if (a === '不明') return 1;
      if (b === '不明') return -1;
      return a.localeCompare(b, 'ja');
    });
    genres.forEach((g) => {
      const n = groupTracks.filter(t => !originKey(t) && chipGenre(t) === g).length;
      filterEl.appendChild(makeChip(`${g} (${n})`, selGenres.has(g), () => { toggle(selGenres, g); render(); }));
    });
    filterEl.classList.toggle('hidden', genres.length === 0);
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

// 一覧用のジャケット(小さな画像)。無ければ元画像で代用し、それも無ければ既定画像
function getThumbUrl(track) {
  if (!track) return 'icons/default-artwork.png';
  if (thumbUrlCache.has(track.id)) return thumbUrlCache.get(track.id);
  const blob = thumbMap.get(track.id);
  if (!blob) return getArtworkUrl(track);
  const url = URL.createObjectURL(blob);
  thumbUrlCache.set(track.id, url);
  return url;
}

// 元のジャケット画像から、一覧用の小さな正方形(JPEG)を作る。一覧の小さな表示に、大きな画像を毎回展開しなくて済む
async function makeThumb(blob) {
  const size = 120;
  const bmp = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const side = Math.min(bmp.width, bmp.height);
  canvas.getContext('2d').drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, size, size);
  if (bmp.close) bmp.close();
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.8));
}

async function saveThumb(track) {
  if (!track.artworkBlob || thumbMap.has(track.id)) return false;
  try {
    const thumb = await makeThumb(track.artworkBlob);
    if (!thumb) return false;
    await DB.putThumb(track.id, thumb);
    thumbMap.set(track.id, thumb);
    return true;
  } catch (e) {
    console.error('サムネイル作成失敗:', track.title, e);
    return false;
  }
}

// 起動後に、サムネイルの無い曲(以前の版で取り込んだ曲など)の分を、少しずつ裏で作る
let isMigratingThumbs = false;
async function migrateThumbs() {
  if (isMigratingThumbs) return;
  isMigratingThumbs = true;
  let made = 0;
  const todo = tracks.filter(t => t.artworkBlob && !thumbMap.has(t.id));
  for (let i = 0; i < todo.length; i += 10) {
    const results = await Promise.all(todo.slice(i, i + 10).map(saveThumb));
    made += results.filter(Boolean).length;
    await new Promise(r => setTimeout(r, 30)); // 操作の邪魔にならないよう、間を空ける
  }
  isMigratingThumbs = false;
  if (made > 0) {
    // 作れた分を、表示中の一覧へ反映する
    document.querySelectorAll('.track-item').forEach((el) => {
      const t = tracks.find(x => String(x.id) === el.dataset.trackId);
      if (t && thumbMap.has(t.id)) el.querySelector('.track-artwork').src = getThumbUrl(t);
    });
    markLibraryChanged(); // 年代/ジャンル/アーティスト一覧は、次に開くときに作り直す
  }
}

function renderTrackList(filter = '') {
  const listEl = document.getElementById('track-list');
  const emptyHint = document.getElementById('empty-hint');
  const f = filter.toLowerCase();
  const filtered = tracks
    .filter(t => !f || t.title.toLowerCase().includes(f) || t.artist.toLowerCase().includes(f))
    .sort((a, b) => sectionSort(trackSortKey(a), trackSortKey(b)));

  emptyHint.classList.toggle('hidden', tracks.length > 0);
  fillTrackList(listEl, filtered, filtered.map(t => t.id));
}

// ===== 右端のインデックスバー(あ〜わ / A〜Z / #) =====
const INDEX_LABELS = [...'あかさたなはまやらわ', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ', '#'];
const INDEX_VIEWS = { 'view-library': 'track-list', 'view-artists': 'artist-list', 'view-add-songs': 'add-songs-list' }; // バーを出す画面 → 対象の一覧
const KANA_ROWS = {
  'あ': 'ぁあぃいぅうぇえぉおゔ', 'か': 'かきくけこゕゖ', 'さ': 'さしすせそ', 'た': 'たちつってとっ', 'な': 'なにぬねの',
  'は': 'はひふへほ', 'ま': 'まみむめも', 'や': 'ゃやゅゆょよ', 'ら': 'らりるれろ', 'わ': 'ゎわゐゑをん',
};

// 先頭文字の所属: ひらがな/カタカナ→行の代表(濁音・半濁音・小書きも同じ行)、英字→A〜Z、それ以外(漢字・数字・記号)→#
function sectionOfRaw(str) {
  const c = (str || '').normalize('NFKC').trim().charAt(0);
  if (!c) return '#';
  const h = c.replace(/[ァ-ヶ]/, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60));
  if (/[A-Za-z]/.test(h)) return h.toUpperCase();
  const base = h.normalize('NFD').charAt(0); // 濁点・半濁点を分離して清音にする
  for (const [row, chars] of Object.entries(KANA_ROWS)) if (chars.includes(base)) return row;
  return '#';
}

// 文字ごとの分類は結果を覚えておく(並び替えの比較のたびに計算し直さない)
const sectionCache = new Map();
function sectionOf(str) {
  const k = str || '';
  let v = sectionCache.get(k);
  if (v === undefined) { v = sectionOfRaw(k); sectionCache.set(k, v); }
  return v;
}

const SECTION_INDEX = new Map(INDEX_LABELS.map((l, i) => [l, i]));
const JA_COLLATOR = new Intl.Collator('ja'); // localeCompareは毎回照合器を作るので遅い
function sectionSort(a, b) {
  const d = SECTION_INDEX.get(sectionOf(a)) - SECTION_INDEX.get(sectionOf(b));
  return d !== 0 ? d : JA_COLLATOR.compare(a, b);
}

let indexListId = null;

function jumpToSection(label) {
  if (!indexListId) return;
  const target = INDEX_LABELS.indexOf(label);
  const listEl = document.getElementById(indexListId);
  const view = document.querySelector('.view.active');
  if (!listEl || !view) return;
  const topbar = view.querySelector('.topbar');
  const offset = topbar ? topbar.offsetHeight : 0;
  const listTop = () => listEl.getBoundingClientRect().top - view.getBoundingClientRect().top + view.scrollTop;
  // その頭文字の曲が無ければ、次に近い頭文字へ(Apple Musicと同じ)
  if (listEl._v) { // 曲一覧(仮想スクロール): 配列から位置を計算して、そこへスクロールする
    const idx = listEl._v.list.findIndex(t => SECTION_INDEX.get(sectionOf(trackSortKey(t))) >= target);
    if (idx < 0) return;
    view.scrollTop = listTop() + headHeight(listEl) + idx * ROW_H - offset;
    updateVirtualWindow(listEl, true);
    return;
  }
  const hit = [...listEl.querySelectorAll('[data-section]')].find(el => SECTION_INDEX.get(el.dataset.section) >= target);
  if (hit) view.scrollTop += hit.getBoundingClientRect().top - view.getBoundingClientRect().top - offset;
}

// 触覚フィードバック(文字が切り替わるたびの「コツッ」)。iPhoneのSafariにはVibration APIが無いため、
// iOS 17.4以降の <input type=checkbox switch> をプログラムから切り替えたときの触覚を利用する。非対応の端末では何も起きない
let hapticLabel = null;
function hapticTick() {
  try {
    if (!hapticLabel) {
      hapticLabel = document.createElement('label');
      hapticLabel.setAttribute('aria-hidden', 'true');
      hapticLabel.style.display = 'none';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.setAttribute('switch', '');
      hapticLabel.appendChild(input);
      document.head.appendChild(hapticLabel);
    }
    hapticLabel.click();
    if (navigator.vibrate) navigator.vibrate(8); // Android等
  } catch (e) { /* 触覚が使えなくても動作に影響しない */ }
}

// iOS標準の一覧インデックスと同様: 文字1つ1つが独立した当たり判定を持ち、指が別の文字に移るたびに触覚+ジャンプする
function setupIndexBar() {
  const bar = document.getElementById('index-bar');
  const spans = INDEX_LABELS.map((l) => {
    const span = document.createElement('span');
    span.textContent = l;
    bar.appendChild(span);
    return span;
  });
  let lastLabel = null;

  const labelAt = (clientY) => {
    const r = bar.getBoundingClientRect();
    const i = Math.min(INDEX_LABELS.length - 1, Math.max(0, Math.floor(((clientY - r.top) / r.height) * INDEX_LABELS.length)));
    return { label: INDEX_LABELS[i], i };
  };
  const touchAt = (clientY) => {
    const { label, i } = labelAt(clientY);
    bar.classList.add('touching');
    spans.forEach((sp, k) => sp.classList.toggle('current', k === i));
    if (label !== lastLabel) { // 文字が変わったときだけ
      lastLabel = label;
      hapticTick();
      jumpToSection(label);
    }
  };
  const release = () => {
    lastLabel = null;
    bar.classList.remove('touching');
    spans.forEach(sp => sp.classList.remove('current'));
  };

  const onTouch = (e) => { e.preventDefault(); touchAt(e.touches[0].clientY); };
  bar.addEventListener('touchstart', onTouch, { passive: false });
  bar.addEventListener('touchmove', onTouch, { passive: false });
  bar.addEventListener('touchend', release);
  bar.addEventListener('touchcancel', release);
  // PCブラウザ用
  bar.addEventListener('mousedown', (e) => {
    touchAt(e.clientY);
    const move = (ev) => touchAt(ev.clientY);
    const up = () => { release(); window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  });
}

// ===== 一覧の先頭に置く「再生 / シャッフル」ボタン(Apple Musicと同様) =====
function setShuffle(on) {
  isShuffle = on;
  document.getElementById('btn-shuffle').classList.toggle('active', isShuffle);
}

function playAll(ids, shuffle) {
  if (!ids || ids.length === 0) return;
  setShuffle(shuffle);
  const startId = shuffle ? ids[Math.floor(Math.random() * ids.length)] : ids[0];
  playTrackById(startId, ids);
}

function buildPlayRow(ids) {
  const li = document.createElement('li');
  li.className = 'play-row';
  const mk = (iconKey, label, shuffle) => {
    const b = document.createElement('button');
    b.className = 'play-row-btn';
    b.innerHTML = `${svgIcon(ICON_PATHS[iconKey], 20)}<span>${label}</span>`;
    b.addEventListener('click', () => playAll(ids, shuffle));
    return b;
  };
  li.appendChild(mk('play', '再生', false));
  li.appendChild(mk('shuffle', 'シャッフル', true));
  return li;
}

const HTML_ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => HTML_ESC[c]);

// 1曲分の行。要素を1つずつ作るより、HTML文字列にして一括で挿入するほうがはるかに速い
function trackItemHTML(track) {
  const playing = currentTrack && currentTrack.id === track.id;
  return `<li class="track-item${playing ? ' playing' : ''}" data-track-id="${track.id}" data-section="${esc(sectionOf(trackSortKey(track)))}">` +
    `<img class="track-artwork" loading="lazy" decoding="async" src="${getThumbUrl(track)}" alt="">` +
    `<div class="track-meta"><div class="track-title">${esc(track.title)}</div><div class="track-artist">${esc(track.artist)}</div></div>` +
    `${track.favorite ? '<span class="fav-mark">★</span>' : ''}<button class="track-menu-btn">⋯</button></li>`;
}

// 行を段階的に挿入する。最初の一部だけ先に表示して、残りは少しずつ追加する(数千曲でも画面が固まらない)
// ===== 仮想スクロール: 画面に見えている範囲の前後の行だけを描画する(数千曲でも行数は約100に保つ) =====
const ROW_H = 63;     // 曲の行の高さ(CSSの .track-item と一致させる)
const PLAY_H = 64;    // 先頭の「再生/シャッフル」行の高さ(CSSの .play-row と一致させる)
const V_BUFFER = 30;  // 見えている範囲の上下に、余分に描画しておく行数(速いスクロールで空白が出ないように)

// 一覧の先頭にある「再生/シャッフル」行の高さ(曲を追加する画面のように、無い一覧は0)
const headHeight = (listEl) => (listEl.querySelector(':scope > .play-row') ? PLAY_H : 0);

function updateVirtualWindow(listEl, force) {
  const v = listEl._v;
  if (!v || listEl.getClientRects().length === 0) return; // 表示されていない一覧は更新しない
  const view = listEl.closest('.view');
  if (!view) return;
  const listTop = listEl.getBoundingClientRect().top - view.getBoundingClientRect().top + view.scrollTop;
  const first = Math.floor((view.scrollTop - listTop - headHeight(listEl)) / ROW_H);
  const visible = Math.ceil(view.clientHeight / ROW_H);
  const n = v.list.length;
  const needStart = Math.max(0, first);
  const needEnd = Math.min(n, first + visible + 1);
  // 必要な範囲が、描画済みの範囲(の内側に余裕を持たせた範囲)に収まっていれば、何もしない
  if (!force && v.start >= 0 && v.start <= Math.max(0, needStart - V_BUFFER / 3) && v.end >= Math.min(n, needEnd + V_BUFFER / 3)) return;
  const start = Math.max(0, first - V_BUFFER);
  const end = Math.min(n, first + visible + V_BUFFER);
  while (v.top.nextSibling && v.top.nextSibling !== v.bottom) v.top.nextSibling.remove();
  v.bottom.insertAdjacentHTML('beforebegin', v.list.slice(start, end).map(listEl._rowFn || trackItemHTML).join(''));
  v.top.style.height = `${start * ROW_H}px`;
  v.bottom.style.height = `${(n - end) * ROW_H}px`;
  v.start = start;
  v.end = end;
}

function renderVirtualList(listEl, list) {
  const top = document.createElement('li');
  const bottom = document.createElement('li');
  top.className = bottom.className = 'v-spacer';
  listEl.append(top, bottom);
  listEl._v = { list, top, bottom, start: -1, end: -1 };
  const view = listEl.closest('.view');
  if (view && !view._vScrollBound) {
    view._vScrollBound = true;
    let pending = false;
    view.addEventListener('scroll', () => {
      if (pending) return;
      pending = true;
      requestAnimationFrame(() => {
        pending = false;
        view.querySelectorAll('ul').forEach(ul => { if (ul._v) updateVirtualWindow(ul, false); });
      });
    }, { passive: true });
  }
  updateVirtualWindow(listEl, true);
}

// 曲一覧の共通の描画。先頭に再生/シャッフルを置き、クリックは一覧全体で1回だけ受ける(行ごとに登録しない)
function fillTrackList(listEl, list, ids) {
  listEl.innerHTML = '';
  listEl._queueIds = ids;
  listEl._v = null;
  if (list.length > 0) listEl.appendChild(buildPlayRow(ids));
  renderVirtualList(listEl, list);
  if (listEl._clickBound) return;
  listEl._clickBound = true;
  listEl.addEventListener('click', (e) => {
    const li = e.target.closest('.track-item');
    if (!li || !listEl.contains(li)) return;
    const track = tracks.find(t => String(t.id) === li.dataset.trackId);
    if (!track) return;
    if (e.target.closest('.track-menu-btn')) openTrackActionSheet(track);
    else playTrackById(track.id, listEl._queueIds);
  });
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

// お気に入り(★)の付け外し。再生画面・曲のメニュー・お気に入りの曲(スワイプ)から呼ぶ
async function toggleFavorite(track) {
  track.favorite = !track.favorite;
  await DB.updateTrack(track);
  updateFavButton();
  // 全ての一覧(今は表示されていない画面も含む)の、この曲の行の ★ を直接付け外しする
  document.querySelectorAll(`.track-item[data-track-id="${track.id}"]`).forEach((li) => {
    const mark = li.querySelector('.fav-mark');
    if (track.favorite && !mark) li.querySelector('.track-menu-btn').insertAdjacentHTML('beforebegin', '<span class="fav-mark">★</span>');
    else if (!track.favorite && mark) mark.remove();
  });
  renderPlaylistList();
  if (currentPlaylistId === 'fav' && document.getElementById('view-playlist-detail').classList.contains('active')) openPlaylistDetail('fav');
}
function updateFavButton() {
  const btn = document.getElementById('btn-np-fav');
  const on = !!(currentTrack && currentTrack.favorite);
  btn.innerHTML = svgIcon(ICON_PATHS[on ? 'heartFilled' : 'heart'], 24);
  btn.classList.toggle('on', on);
}

async function openTrackActionSheet(track) {
  const options = [track.favorite ? 'お気に入りから外す' : 'お気に入りに追加', 'プレイリストに追加', '季節を設定(春夏秋冬)', '歌詞ファイルを読み込む', '歌詞をネットで再検索'];
  if (typeof currentPlaylistId === 'number') options.push('このプレイリストから削除');
  options.push('ライブラリから削除');
  const idx = await showChoiceSheet(track.title, options);
  if (idx < 0) return;
  const label = options[idx];
  if (label === 'お気に入りに追加' || label === 'お気に入りから外す') toggleFavorite(track);
  else if (label === 'プレイリストに追加') addTrackToPlaylistPrompt(track.id);
  else if (label === '季節を設定(春夏秋冬)') setTrackSeason(track);
  else if (label === '歌詞ファイルを読み込む') importLyricsForTrack(track);
  else if (label === '歌詞をネットで再検索') refetchLyrics(track);
  else if (label === 'このプレイリストから削除') removeTrackFromCurrentPlaylist(track.id);
  else if (label === 'ライブラリから削除') deleteTrackFromLibrary(track.id);
}

// この1曲だけ、曲の長さに合う歌詞をネットで検索し直す(ずれている曲の直し用)
async function refetchLyrics(track) {
  try {
    const result = await applyLyricsFromNet(track);
    if (currentTrack && currentTrack.id === track.id) { lastActiveLyricIdx = -1; updateLyricsPane(); }
    if (result === 'synced') alert('曲の長さに合う歌詞が見つかりました。曲に合わせて動きます。');
    else if (result === 'plain') alert('この曲の長さに合う「時刻付き」の歌詞は見つからず、文字だけの歌詞を登録しました(曲に合わせては動きません)。');
    else alert('この曲の歌詞は見つかりませんでした。');
  } catch (err) {
    console.error('歌詞の再検索失敗:', track.title, err);
    alert('歌詞の検索に失敗しました(通信状況を確認してください)。');
  }
}

async function deleteTrackFromLibrary(trackId) {
  if (!confirm('この曲をライブラリから削除しますか?')) return;
  await DB.deleteTrack(trackId);
  await DB.deleteThumb(trackId);
  thumbMap.delete(trackId);
  thumbUrlCache.delete(trackId);
  tracks = tracks.filter(t => t.id !== trackId);
  playlists.forEach(p => { p.trackIds = p.trackIds.filter(id => id !== trackId); });
  for (const p of playlists) await DB.updatePlaylist(p);
  markLibraryChanged();
  renderTrackList(document.getElementById('search-input').value.trim());
  renderPlaylistList();
}

// ===== 季節のプレイリスト(春夏秋冬) =====
// 曲名・アルバム名の言葉から自動で振り分ける。手動で決めた季節(track.season)があればそちらを優先する。'none' = どれでもない
const SEASONS = [
  { key: 'spring', label: '春', re: /春|桜|さくら|サクラ|卒業|入学|花見|菜の花|新生活|桃の花|spring|sakura|cherry\s?blossom/gi },
  { key: 'summer', label: '夏', re: /夏|花火|向日葵|ひまわり|入道雲|夕立|浴衣|蝉|海|サマー|summer|真夏|南国|プール|夏祭/gi },
  { key: 'autumn', label: '秋', re: /秋|紅葉|コスモス|落ち葉|枯葉|月見|十五夜|銀杏|autumn|fall\b|ハロウィン|halloween/gi },
  { key: 'winter', label: '冬', re: /冬|雪|クリスマス|christmas|x'?mas|winter|snow|粉雪|吹雪|聖夜|白い息|こたつ|ホワイトクリスマス/gi },
];
function countMatches(text, re) {
  const m = text.match(re);
  return m ? m.length : 0;
}
function autoSeason(track) {
  // 「秋桜(コスモス)」は春の「桜」に数えない
  const head = `${track.title || ''} ${track.album || ''}`.normalize('NFKC').replace(/秋桜/g, '秋');
  const scoreOf = (text) => SEASONS.map(d => ({ key: d.key, n: countMatches(text, d.re) })).sort((a, b) => b.n - a.n);
  let sc = scoreOf(head);
  if (sc[0].n > 0 && sc[0].n > sc[1].n) return sc[0].key;
  // 曲名で決まらないときは、歌詞に出てくる季節の言葉が多く、はっきり差がある場合だけ採用する
  if (sc[0].n === 0 && track.lyrics) {
    sc = scoreOf(track.lyrics.normalize('NFKC').replace(/秋桜/g, '秋'));
    if (sc[0].n >= 3 && sc[0].n >= sc[1].n * 2) return sc[0].key;
  }
  return '';
}
// 自動判定は歌詞まで正規表現で調べるので重い。曲ごとに結果を覚えておき、曲名・アルバム・歌詞・手動設定が変わったときだけ判定し直す
const seasonCache = new Map(); // 曲のid → { sig, val }
function seasonOf(track) {
  if (track.season === 'none') return '';
  if (track.season) return track.season;
  const sig = `${track.title}|${track.album}|${track.lyrics ? track.lyrics.length : 0}`;
  const c = seasonCache.get(track.id);
  if (c && c.sig === sig) return c.val;
  const val = autoSeason(track);
  seasonCache.set(track.id, { sig, val });
  return val;
}
async function setTrackSeason(track) {
  const options = [...SEASONS.map(d => d.label), 'どれでもない', '自動判定に戻す'];
  const idx = await showChoiceSheet(`${track.title} の季節`, options);
  if (idx < 0) return;
  if (idx < SEASONS.length) track.season = SEASONS[idx].key;
  else if (idx === SEASONS.length) track.season = 'none';
  else delete track.season;
  await DB.updateTrack(track);
  renderPlaylistList();
  if (typeof currentPlaylistId === 'string') openPlaylistDetail(currentPlaylistId);
}

// ===== プレイリスト =====
// 春夏秋冬とプレイリストを、まとめて好きな順に並べられる。順番(キーの配列)は端末に保存する
const PLAYLIST_ORDER_KEY = 'playlistOrder';
let playlistEditMode = false;

function playlistItemKey(item) { return item.fav ? 'fav' : item.season ? 'season:' + item.season.key : 'pl:' + item.pl.id; }

function orderedPlaylistItems() {
  // 標準の並び: プレイリスト(作成が新しい順。旧版で並べ替えた順があればそれ) → 春夏秋冬
  const defaults = [
    { fav: true },
    ...playlists.slice().sort((a, b) => {
      const oa = a.order === undefined ? Infinity : a.order;
      const ob = b.order === undefined ? Infinity : b.order;
      if (oa !== ob) return oa === Infinity ? 1 : ob === Infinity ? -1 : oa - ob;
      return b.createdAt - a.createdAt;
    }).map(pl => ({ pl })),
    ...SEASONS.map(d => ({ season: d })),
  ];
  let saved = [];
  try { saved = JSON.parse(localStorage.getItem(PLAYLIST_ORDER_KEY)) || []; } catch (e) { /* 保存できない環境では標準の並び */ }
  const byKey = new Map(defaults.map(it => [playlistItemKey(it), it]));
  const savedItems = [];
  saved.forEach((k) => { if (byKey.has(k)) { savedItems.push(byKey.get(k)); byKey.delete(k); } });
  // 並び替えた後に作ったプレイリストなど、順が決まっていないものは、いちばん上に出す
  return [...defaults.filter(it => byKey.has(playlistItemKey(it))), ...savedItems];
}

// プレイリスト画面を開いていないときは描画せず、開いたときにまとめて描く(★の付け外しなどのたびに全曲を調べ直さない)
let playlistListDirty = true;
function renderPlaylistList() {
  if (!document.getElementById('view-playlists').classList.contains('active')) { playlistListDirty = true; return; }
  playlistListDirty = false;
  const listEl = document.getElementById('playlist-list');
  listEl.innerHTML = '';
  const byId = new Map(tracks.map(t => [t.id, t]));
  const bySeason = new Map();
  tracks.forEach((t) => { const k = seasonOf(t); if (k) { if (!bySeason.has(k)) bySeason.set(k, []); bySeason.get(k).push(t); } });
  const favs = tracks.filter(t => t.favorite);
  orderedPlaylistItems().forEach((item) => {
    const li = document.createElement('li');
    li.className = 'playlist-item';
    li.dataset.key = playlistItemKey(item);
    let list, name, countText, open;
    if (item.fav) {
      list = favs;
      name = 'お気に入りの曲';
      countText = `${list.length}曲`;
      open = () => openPlaylistDetail('fav');
    } else if (item.season) {
      list = bySeason.get(item.season.key) || [];
      name = item.season.label;
      countText = `${list.length}曲(自動)`;
      open = () => openPlaylistDetail('season:' + item.season.key);
    } else {
      list = item.pl.trackIds.map(id => byId.get(id)).filter(Boolean);
      name = item.pl.name;
      countText = `${item.pl.trackIds.length}曲`;
      open = () => openPlaylistDetail(item.pl.id);
    }
    const img = document.createElement('img');
    img.className = 'playlist-artwork';
    img.src = list.length ? getThumbUrl(list.find(t => t.artworkBlob) || list[0]) : 'icons/default-artwork.png';
    const meta = document.createElement('div');
    meta.className = 'track-meta';
    const nameEl = document.createElement('div');
    nameEl.className = 'playlist-name';
    nameEl.textContent = name;
    const countEl = document.createElement('div');
    countEl.className = 'playlist-count';
    countEl.textContent = countText;
    meta.append(nameEl, countEl);
    li.append(img, meta);
    if (playlistEditMode) {
      const handle = document.createElement('div');
      handle.className = 'drag-handle';
      handle.textContent = '≡';
      handle.addEventListener('pointerdown', (e) => startRowDrag(e, li, listEl, (rows) => {
        const keys = rows.map(el => el.dataset.key);
        try { localStorage.setItem(PLAYLIST_ORDER_KEY, JSON.stringify(keys)); } catch (err) { /* 保存できなくても、この画面では並んだまま */ }
      }));
      li.appendChild(handle);
    } else {
      li.addEventListener('click', open);
      if (item.pl) {
        // 誤タップで消さないよう、削除は「⋯」を押したメニューの中に置く
        const more = document.createElement('button');
        more.className = 'track-menu-btn';
        more.textContent = '⋯';
        more.addEventListener('click', (e) => { e.stopPropagation(); openPlaylistActionSheet(item.pl); });
        li.appendChild(more);
      }
    }
    listEl.appendChild(li);
  });
}

// 右端の「≡」をつかんで上下にドラッグ → 指を離した位置に並べ替える。画面の上下の端に近づくと、自動でスクロールする
// 離したとき、onDone(並んだ行の一覧) を呼ぶ
function startRowDrag(e, li, listEl, onDone) {
  e.preventDefault();
  const handle = e.currentTarget;
  handle.setPointerCapture(e.pointerId);
  const view = listEl.closest('.view');
  let clientY = e.clientY;
  let startDoc = e.clientY + view.scrollTop; // 画面のスクロールを含めた、つかんだ位置
  let raf = null;
  li.classList.add('dragging');
  const update = () => {
    let dy = clientY + view.scrollTop - startDoc;
    // 上や下の行の中心を越えたら入れ替える(入れ替えた分、基準の位置をずらす)
    for (;;) {
      const prev = li.previousElementSibling;
      const next = li.nextElementSibling;
      if (prev && dy < -prev.offsetHeight / 2) { listEl.insertBefore(prev, li.nextSibling); startDoc -= prev.offsetHeight; dy += prev.offsetHeight; }
      else if (next && dy > next.offsetHeight / 2) { listEl.insertBefore(next, li); startDoc += next.offsetHeight; dy -= next.offsetHeight; }
      else break;
    }
    li.style.transform = `translateY(${dy}px)`;
  };
  const tick = () => {
    const r = view.getBoundingClientRect();
    const zone = 110;
    let v = 0;
    if (clientY < r.top + zone) v = -Math.min(14, (r.top + zone - clientY) / 6);
    else if (clientY > r.bottom - zone) v = Math.min(14, (clientY - (r.bottom - zone)) / 6);
    if (v) { view.scrollTop += v; update(); }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  const move = (ev) => { clientY = ev.clientY; update(); };
  const end = () => {
    cancelAnimationFrame(raf);
    handle.removeEventListener('pointermove', move);
    handle.removeEventListener('pointerup', end);
    handle.removeEventListener('pointercancel', end);
    li.classList.remove('dragging');
    li.style.transform = '';
    onDone([...listEl.children]);
  };
  handle.addEventListener('pointermove', move);
  handle.addEventListener('pointerup', end);
  handle.addEventListener('pointercancel', end);
}

// プレイリストの中の曲の並べ替え: 「並び替え」を押すと全曲を普通の一覧で出し、「≡」で動かす
let songEditMode = false;
function renderSongEditList() {
  const pl = playlists.find(p => p.id === currentPlaylistId);
  if (!pl) return;
  const listEl = document.getElementById('playlist-detail-list');
  listEl._v = null;
  listEl.innerHTML = pl.trackIds.map(id => tracks.find(t => t.id === id)).filter(Boolean).map(t =>
    `<li class="edit-row" data-track-id="${t.id}"><img class="track-artwork" decoding="async" src="${getThumbUrl(t)}" alt="">` +
    `<div class="track-meta"><div class="track-title">${esc(t.title)}</div><div class="track-artist">${esc(t.artist)}</div></div>` +
    `<div class="drag-handle">≡</div></li>`).join('');
}
function toggleSongEditMode() {
  const btn = document.getElementById('btn-playlist-reorder');
  songEditMode = !songEditMode;
  btn.textContent = songEditMode ? '完了' : '並び替え';
  document.getElementById('btn-playlist-add').classList.toggle('hidden', songEditMode);
  if (songEditMode) renderSongEditList();
  else openPlaylistDetail(currentPlaylistId); // 通常の一覧(先頭の再生ボタン付き)に戻す
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
  const isSeason = typeof playlistId === 'string';
  let pl;
  let plTracks;
  if (playlistId === 'fav') {
    pl = { name: 'お気に入りの曲' };
    plTracks = tracks.filter(t => t.favorite).sort((a, b) => sectionSort(trackSortKey(a), trackSortKey(b)));
  } else if (isSeason) {
    const def = SEASONS.find(d => 'season:' + d.key === playlistId);
    pl = { name: `${def.label}の曲` };
    plTracks = tracks.filter(t => seasonOf(t) === def.key).sort((a, b) => sectionSort(trackSortKey(a), trackSortKey(b)));
  } else {
    pl = playlists.find(p => p.id === playlistId);
    if (!pl) return;
    plTracks = pl.trackIds.map(id => tracks.find(t => t.id === id)).filter(Boolean);
  }
  document.getElementById('playlist-detail-title').textContent = pl.name;
  document.getElementById('btn-playlist-add').classList.toggle('hidden', typeof playlistId !== 'number'); // 曲を足せるのは自分のプレイリストだけ
  document.getElementById('btn-playlist-reorder').classList.toggle('hidden', typeof playlistId !== 'number');
  if (songEditMode) { songEditMode = false; document.getElementById('btn-playlist-reorder').textContent = '並び替え'; } // 別のプレイリストを開いたら、並び替えは終わり
  const listEl = document.getElementById('playlist-detail-list');
  fillTrackList(listEl, plTracks, plTracks.map(t => t.id));
  showView('view-playlist-detail');
}

// ===== プレイリストに曲を追加する画面(Apple Musicと同じく、検索して「＋」を押していく) =====
let addSongsPlaylist = null;

function addRowHTML(track) {
  const on = addSongsPlaylist && addSongsPlaylist.trackIds.includes(track.id);
  return `<li class="track-item add-row" data-track-id="${track.id}">` +
    `<img class="track-artwork" loading="lazy" decoding="async" src="${getThumbUrl(track)}" alt="">` +
    `<div class="track-meta"><div class="track-title">${esc(track.title)}</div><div class="track-artist">${esc(track.artist)}</div></div>` +
    `<button class="add-btn${on ? ' on' : ''}">${on ? '✓' : '＋'}</button></li>`;
}

let addSongsSorted = { version: -1, list: [] };
function renderAddSongsList(query) {
  const q = (query || '').normalize('NFKC').toLowerCase();
  if (addSongsSorted.version !== libVersion) { // 並べ替えは重いので、ライブラリが変わったときだけやり直す
    addSongsSorted = { version: libVersion, list: tracks.slice().sort((a, b) => sectionSort(trackSortKey(a), trackSortKey(b))) };
  }
  const list = addSongsSorted.list.filter(t => !q || `${t.title} ${t.artist} ${t.album || ''}`.normalize('NFKC').toLowerCase().includes(q));
  const listEl = document.getElementById('add-songs-list');
  listEl.innerHTML = '';
  listEl._rowFn = addRowHTML;
  listEl._v = null;
  renderVirtualList(listEl, list);
}

function openAddSongs() {
  const pl = playlists.find(p => p.id === currentPlaylistId);
  if (!pl) return;
  addSongsPlaylist = pl;
  document.getElementById('add-songs-search').value = '';
  renderAddSongsList('');
  showView('view-add-songs');
  document.getElementById('view-add-songs').scrollTop = 0;
}

async function toggleSongInPlaylist(trackIdText) {
  const pl = addSongsPlaylist;
  const t = tracks.find(x => String(x.id) === trackIdText);
  if (!pl || !t) return;
  const i = pl.trackIds.indexOf(t.id);
  if (i >= 0) pl.trackIds.splice(i, 1); else pl.trackIds.push(t.id);
  const on = i < 0;
  document.querySelectorAll(`.add-row[data-track-id="${t.id}"] .add-btn`).forEach((b) => {
    b.classList.toggle('on', on);
    b.textContent = on ? '✓' : '＋';
  });
  await DB.updatePlaylist(pl);
}

function closeAddSongs() {
  addSongsPlaylist = null;
  renderPlaylistList();
  openPlaylistDetail(currentPlaylistId); // 追加した曲が並んだ状態で、プレイリストに戻る
}

async function openPlaylistActionSheet(pl) {
  const idx = await showChoiceSheet(pl.name, ['プレイリストを削除']);
  if (idx !== 0) return;
  if (!confirm(`プレイリスト「${pl.name}」を削除しますか?(曲自体はライブラリに残ります)`)) return;
  deletePlaylistById(pl.id);
}

// 曲そのものはライブラリに残る
async function deletePlaylistById(idText) {
  const pl = playlists.find(p => String(p.id) === String(idText));
  if (!pl) return;
  await DB.deletePlaylist(pl.id);
  playlists = playlists.filter(p => p !== pl);
  renderPlaylistList();
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
  btn.innerHTML = svgIcon(ICON_PATHS[repeatMode === 'one' ? 'repeatOne' : 'repeat'], 24);
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
  updateFavButton();
  document.getElementById('mini-artwork').src = getThumbUrl(currentTrack);
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
  // 歌詞の切り替えは、再生中だけ毎フレーム確認する(timeupdateは約0.25秒に1回なので、それだけだと歌詞が遅れて見える)
  let lyricRaf = null;
  const lyricLoop = () => {
    highlightCurrentLyricLine();
    lyricRaf = audioEl.paused ? null : requestAnimationFrame(lyricLoop);
  };
  audioEl.addEventListener('play', () => { setPlayPauseIcon(true); if (lyricRaf === null) lyricRaf = requestAnimationFrame(lyricLoop); });
  audioEl.addEventListener('pause', () => { setPlayPauseIcon(false); if (lyricRaf !== null) { cancelAnimationFrame(lyricRaf); lyricRaf = null; } });
  audioEl.addEventListener('seeked', () => highlightCurrentLyricLine());
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
  document.getElementById('btn-playpause').innerHTML = svgIcon(ICON_PATHS[playing ? 'pause' : 'play'], 64);
  document.getElementById('mini-playpause').innerHTML = svgIcon(ICON_PATHS[playing ? 'pause' : 'play'], 28);
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
  if (pane.classList.contains('hidden')) document.getElementById('lyric-offset').classList.add('hidden'); // 歌詞を隠すときは調整ボタンも隠す
  else { lastActiveLyricIdx = -1; updateLyricsPane(); }
}

function updateLyricsPane() {
  const pane = document.getElementById('np-lyrics');
  const offsetBar = document.getElementById('lyric-offset');
  offsetBar.classList.add('hidden'); // 時刻付きの歌詞を表示しているときだけ出す
  if (pane.classList.contains('hidden')) return;
  pane.innerHTML = '';
  pane.onclick = null;

  if (currentTrack.syncedLyrics && currentTrack.syncedLyrics.length > 0) {
    currentTrack.syncedLyrics.forEach((line) => {
      const div = document.createElement('div');
      div.className = 'lyric-line';
      div.textContent = line.text || '♪';
      div.addEventListener('click', () => {
        if (lyricSyncMode) {
          // 「今、この行を歌っている」→ 今の再生位置に、この行の時刻が来るように補正する
          setLyricOffset(line.time - audioEl.currentTime);
          lyricSyncMode = false;
          const bar = document.getElementById('lyric-offset');
          if (bar._syncDone) bar._syncDone();
          return;
        }
        audioEl.currentTime = Math.max(0, line.time - (currentTrack.lyricOffset || 0));
      });
      pane.appendChild(div);
    });
    offsetBar.replaceChildren(...buildLyricOffsetControls());
    offsetBar.classList.remove('hidden');
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

// 歌詞のタイミング手動調整(歌詞欄の下に固定)。プラス = 歌詞が早く出る / マイナス = 遅く出る。曲ごとに保存する
let lyricOffsetSaveTimer = null;
let lyricSyncMode = false; // true の間は、次にタップした歌詞の行を「今歌っている行」として、自動で合わせる

function setLyricOffset(value) {
  currentTrack.lyricOffset = Math.round(value * 10) / 10;
  lastActiveLyricIdx = -1;
  highlightCurrentLyricLine();
  clearTimeout(lyricOffsetSaveTimer);
  const target = currentTrack;
  lyricOffsetSaveTimer = setTimeout(() => DB.updateTrack(target), 700); // 連続で押している間は保存しない
}

function buildLyricOffsetControls() {
  lyricSyncMode = false;
  const label = document.createElement('button');
  label.className = 'lyric-offset-label';
  const show = () => {
    const o = currentTrack.lyricOffset || 0;
    label.textContent = `ずれ ${o > 0 ? '+' : ''}${o.toFixed(1)}秒`;
  };
  const change = (delta) => { setLyricOffset((currentTrack.lyricOffset || 0) + delta); show(); };
  const mk = (text, delta) => {
    const b = document.createElement('button');
    b.className = 'lyric-offset-btn';
    b.textContent = text;
    b.addEventListener('click', (e) => { e.stopPropagation(); change(delta); });
    return b;
  };
  label.addEventListener('click', (e) => { e.stopPropagation(); setLyricOffset(0); show(); }); // 押すと0に戻す

  const sync = document.createElement('button');
  sync.className = 'lyric-offset-btn lyric-sync-btn';
  const syncIdle = 'タップで合わせる';
  sync.textContent = syncIdle;
  sync.addEventListener('click', (e) => {
    e.stopPropagation();
    lyricSyncMode = !lyricSyncMode;
    sync.textContent = lyricSyncMode ? '今歌っている行をタップ' : syncIdle;
    sync.classList.toggle('waiting', lyricSyncMode);
  });
  // 歌詞の行がタップされたとき(updateLyricsPane から呼ばれる)に、合わせ終わった表示へ戻すためのフック
  sync._done = () => { sync.textContent = syncIdle; sync.classList.remove('waiting'); show(); };
  document.getElementById('lyric-offset')._syncDone = sync._done;

  show();
  const br = document.createElement('div');
  br.className = 'lyric-offset-break';
  return [mk('−1', -1), mk('−0.1', -0.1), label, mk('+0.1', 0.1), mk('+1', 1), br, sync];
}

// 再生位置に合わせて現在の行をハイライト+自動スクロール(timeupdateから呼ばれる)
function highlightCurrentLyricLine() {
  const pane = document.getElementById('np-lyrics');
  if (pane.classList.contains('hidden')) return;
  if (!currentTrack || !currentTrack.syncedLyrics || currentTrack.syncedLyrics.length === 0) return;

  const t = audioEl.currentTime + (currentTrack.lyricOffset || 0); // 手動調整(プラスで歌詞が早く出る)
  const lines = currentTrack.syncedLyrics;
  let lo = 0, hi = lines.length - 1, activeIdx = -1; // 二分探索: 時刻が t 以下の最後の行
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid].time <= t) { activeIdx = mid; lo = mid + 1; }
    else hi = mid - 1;
  }
  if (activeIdx === lastActiveLyricIdx) return;
  lastActiveLyricIdx = activeIdx;

  const lineEls = pane.querySelectorAll('.lyric-line');
  lineEls.forEach((el, idx) => el.classList.toggle('active', idx === activeIdx));
  if (activeIdx >= 0 && lineEls[activeIdx]) {
    // scrollIntoViewは外側の画面まで動かすことがあるため、歌詞欄の中だけをスクロールする
    const el = lineEls[activeIdx];
    pane.scrollTo({ top: el.offsetTop - pane.clientHeight / 2 + el.offsetHeight / 2, behavior: 'smooth' });
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

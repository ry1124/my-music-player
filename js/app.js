// ===== 状態 =====
let tracks = [];            // DBから読み込んだ全曲
let playlists = [];         // 全プレイリスト
let currentQueue = [];      // 再生中のtrackId配列(シャッフル適用後)
let baseQueue = [];         // シャッフル前の元の並び
let currentIndex = -1;
let currentTrack = null;
let isShuffle = false;
let repeatMode = 'off';     // 'off' | 'all' | 'one'
let seeking = false;
let currentPlaylistId = null; // プレイリスト詳細画面で表示中のID
// スリープタイマー(アプリを再起動すると解除される。曲をまたいで数えるので、一時停止中も進む)
let sleepTimerId = null;        // 時間指定のsetTimeoutのID
let sleepTimerEndAt = null;     // 止まる予定の時刻(Date.now()と比べる用)
let sleepTimerEndOfTrack = false; // true: 今の曲が終わったところで止める
let lastGroupListView = 'view-years'; // 年代/ジャンル詳細画面から「戻る」時にどちらに戻るか
const artworkUrlCache = new Map(); // trackId -> objectURL(元のジャケット画像)
const thumbMap = new Map();        // trackId -> 一覧用の小さなジャケット画像(Blob)
const thumbUrlCache = new Map();   // trackId -> objectURL(サムネイル)

// audio要素は2つ持つ(クロスフェード/ギャップレスのとき、次の曲を、もう一方で先に鳴らし始める)。audioEl は「今の曲を鳴らしている方」
const audioA = document.getElementById('audio-el');
const audioB = new Audio();
audioB.preload = 'auto';
audioB.setAttribute('playsinline', '');
let audioEl = audioA;
const audioUrls = new Map(); // audio要素 → セット中のobject URL

// 音声セッションの種類を「再生」にする(iOS 17+)。これを設定しないと、電話などの割り込みのあと
// 再生中の表示になっても実際には音が出ない(音声の出力先が正しく戻らない)ことがある
if ('audioSession' in navigator) {
  try { navigator.audioSession.type = 'playback'; } catch (e) { /* 対応していない端末では無視 */ }
}

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
  tabAlbums: '<path d="M12 11c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0-9C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 16c-3.31 0-6-2.69-6-6s2.69-6 6-6 6 2.69 6 6-2.69 6-6 6z"/>',
  tabPlaylists: '<path d="M19 9H2v2h17V9zm0-4H2v2h17V5zM2 15h13v-2H2v2zm15-2v6l5-3-5-3z"/>',
  heart: '<path d="M22 9.24l-7.19-.62L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21 12 17.27 18.18 21l-1.63-7.03L22 9.24zM12 15.4l-3.76 2.27 1-4.28-3.32-2.88 4.38-.38L12 6.1l1.71 4.04 4.38.38-3.32 2.88 1 4.28L12 15.4z"/>',
  heartFilled: '<path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>',
  gear: '<path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>',
  tag: '<path d="M17.63 5.84C17.27 5.33 16.67 5 16 5L5 5.01C3.9 5.01 3 5.9 3 7v10c0 1.1.9 1.99 2 1.99L16 19c.67 0 1.27-.33 1.63-.84L22 12l-4.37-6.16z"/>',
  search: '<path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>',
  doc: '<path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/>',
  add: '<path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>',
  moon: '<path d="M12.3 3a9 9 0 1 0 8.7 12.3 7.3 7.3 0 0 1-8.7-12.3z"/>', // スリープタイマー
  expand: '<path d="M9 3H3v6h2V5h4V3zm12 0h-6v2h4v4h2V3zM5 15H3v6h6v-2H5v-4zm14 0v4h-4v2h6v-6h-2z"/>', // 歌詞の拡大表示
};

function setupIcons() {
  const set = (id, key, size) => { document.getElementById(id).innerHTML = svgIcon(ICON_PATHS[key], size); };
  set('btn-prev', 'prev', 38);
  set('btn-next', 'next', 38);
  set('btn-playpause', 'play', 64);
  set('btn-shuffle', 'shuffle', 24);
  set('btn-repeat', 'repeat', 24);
  set('btn-lyrics-toggle', 'lyrics', 24);
  set('btn-queue', 'tabGenres', 24);
  set('btn-sleep-timer', 'moon', 20);
  set('btn-lyrics-expand', 'expand', 16);
  set('mini-playpause', 'play', 28);
  set('mini-next', 'next', 28);
  // タブバー・上部ボタンも単色アイコンにする(白い画面でカラー絵文字が浮かないように)
  const tabIcons = { library: 'tabLibrary', years: 'tabYears', genres: 'tabGenres', artists: 'tabArtists', albums: 'tabAlbums', playlists: 'tabPlaylists' };
  Object.entries(tabIcons).forEach(([tab, key]) => {
    document.querySelector(`.tab-btn[data-tab="${tab}"] .tab-icon`).innerHTML = svgIcon(ICON_PATHS[key], 24);
  });
  set('btn-add', 'add', 26);
  set('btn-settings', 'gear', 22);
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
  setTimeout(() => { // 春夏秋冬の判定を、空き時間に少しずつ済ませておく(プレイリスト画面を初めて開くときに待たされないように)
    let i = 0;
    const step = () => {
      const end = Math.min(tracks.length, i + 200);
      for (; i < end; i++) seasonOf(tracks[i]);
      if (i < tracks.length) setTimeout(step, 30);
    };
    step();
  }, 3000);
  setupIcons();
  setupIndexBar();
  showView('view-library'); // 起動直後の画面でもインデックスバーの表示状態を反映
  bindUIEvents();
  bindAudioEvents();
  restorePlaybackState();
  applyPlaybackSpeed();
  setTimeout(autoCheckUpdateSilently, 4000); // 起動が落ち着いてから、裏で新しいバージョンがないか確認する
});

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('service-worker.js').catch(() => {});
  }
}

// ===== タブ切り替え =====
let viewBeforeNowPlaying = 'view-library';
function showView(id) {
  if (selectMode && id !== 'view-library') exitSelectMode(); // 他の画面に移ったら、複数選択モードは自動で終わる
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

  // あ〜わの一覧が出ない画面のうち、一覧を持つ画面には、見た目だけの細いスクロールバーを付ける(あいうえお順の文字送りは無い)
  const plain = !listId && PLAIN_SCROLL_VIEWS.has(active.id);
  document.getElementById('plain-scrollbar').classList.toggle('hidden', !plain);
  active.classList.toggle('has-plain-scrollbar', plain);
  if (plain) updatePlainScrollbar(active);
}
// view-group-detail はアーティストの曲一覧のときだけ対象(年代/ジャンルはあいうえお順バーが出るので、plainは自動で out になる)
const PLAIN_SCROLL_VIEWS = new Set(['view-playlists', 'view-playlist-detail', 'view-queue', 'view-season-folder', 'view-years', 'view-genres', 'view-group-detail', 'view-edit-track', 'view-settings']);

// 見た目だけのスクロールバー(タップして飛ぶ機能は無い)。今の画面のスクロール量から、つまみの位置と大きさを決める
function updatePlainScrollbar(view) {
  const bar = document.getElementById('plain-scrollbar');
  const thumb = document.getElementById('plain-scrollbar-thumb');
  const trackH = bar.clientHeight;
  const contentH = view.scrollHeight;
  const viewH = view.clientHeight;
  if (contentH <= viewH + 2) { thumb.style.height = `${trackH}px`; thumb.style.top = '0px'; return; }
  const h = Math.max(24, trackH * (viewH / contentH));
  const top = (trackH - h) * (view.scrollTop / (contentH - viewH));
  thumb.style.height = `${h}px`;
  thumb.style.top = `${top}px`;
}
// 今の画面が、見た目だけのスクロールバーの対象なら、位置を描き直す(内容の並び替え・追加などのあとに呼ぶ)
function refreshPlainScrollbarIfActive() {
  const active = document.querySelector('.view.active');
  if (active && active.classList.contains('has-plain-scrollbar')) updatePlainScrollbar(active);
}

function bindUIEvents() {
  // 見た目だけのスクロールバー: どの画面をスクロールしても、対象の画面ならつまみを動かす
  document.querySelectorAll('.view').forEach((view) => {
    view.addEventListener('scroll', () => {
      if (!view.classList.contains('has-plain-scrollbar')) return;
      if (view._plainRaf) return;
      view._plainRaf = requestAnimationFrame(() => { view._plainRaf = null; updatePlainScrollbar(view); });
    }, { passive: true });
  });

  // 画面の高さが変わったとき(ミニプレイヤーの表示切り替え・回転・キーボードの開閉など)、
  // 仮想スクロールの描画範囲・見た目だけのスクロールバーを、今の高さに合わせて描き直す
  window.addEventListener('resize', () => {
    const active = document.querySelector('.view.active');
    if (!active) return;
    active.querySelectorAll('ul').forEach((ul) => { if (ul._v) updateVirtualWindow(ul, true); });
    refreshPlainScrollbarIfActive();
  });

  const TAB_VIEW_MAP = {
    library: 'view-library',
    years: 'view-years',
    genres: 'view-genres',
    artists: 'view-artists',
    albums: 'view-albums',
    playlists: 'view-playlists',
  };
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const tab = btn.dataset.tab;
      if (tab === 'years') renderYearList();
      else if (tab === 'genres') renderGenreList();
      else if (tab === 'artists') renderArtistList(document.getElementById('artist-search-input').value.trim());
      else if (tab === 'albums') renderAlbumList(document.getElementById('album-search-input').value.trim());
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
      dialogAlert('音楽ファイル(mp3/m4a/flac/wav等)が選択されていません');
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

  document.getElementById('lyrics-file-input').addEventListener('change', (e) => {
    handleLyricsFilesSelected(e.target.files);
    e.target.value = '';
  });

  document.getElementById('btn-library-more').addEventListener('click', openLibraryMoreSheet);
  document.getElementById('btn-select-mode').addEventListener('click', toggleSelectMode);
  document.getElementById('btn-select-all').addEventListener('click', toggleSelectAll);
  document.getElementById('btn-select-fav').addEventListener('click', bulkFavoriteSelected);
  document.getElementById('btn-select-addpl').addEventListener('click', bulkAddSelectedToPlaylist);
  document.getElementById('btn-select-delete').addEventListener('click', bulkDeleteSelected);
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

  let albumSearchTimer = null;
  document.getElementById('album-search-input').addEventListener('input', (e) => {
    const value = e.target.value.trim();
    clearTimeout(albumSearchTimer);
    albumSearchTimer = setTimeout(() => renderAlbumList(value), 200);
  });

  let artistSearchTimer = null;
  document.getElementById('artist-search-input').addEventListener('input', (e) => {
    const value = e.target.value.trim();
    clearTimeout(artistSearchTimer);
    artistSearchTimer = setTimeout(() => renderArtistList(value), 200);
  });

  document.getElementById('btn-new-playlist').addEventListener('click', createPlaylistPrompt);
  const btnReorder = document.getElementById('btn-reorder-playlist');
  btnReorder.addEventListener('click', () => {
    playlistEditMode = !playlistEditMode;
    btnReorder.textContent = playlistEditMode ? '完了' : '並び替え';
    renderPlaylistList();
  });
  document.getElementById('btn-back-playlists').addEventListener('click', () => showView(playlistDetailBackView));
  document.getElementById('btn-back-season-folder').addEventListener('click', () => showView('view-playlists'));
  document.getElementById('btn-queue').addEventListener('click', openQueue);
  bindSettings();
  ['track-list', 'group-detail-list', 'playlist-detail-list'].forEach(id => bindSwipeToPlayNext(document.getElementById(id)));
  document.getElementById('btn-edit-cancel').addEventListener('click', closeEditTrack);
  document.getElementById('btn-edit-save').addEventListener('click', saveEditTrack);
  document.getElementById('btn-edit-artwork-change').addEventListener('click', () => document.getElementById('edit-artwork-input').click());
  document.getElementById('edit-artwork-input').addEventListener('change', (e) => {
    const file = e.target.files[0];
    e.target.value = ''; // 同じ写真を選び直したときも change が起きるように
    if (!file) return;
    editingArtwork = file;
    updateEditArtworkPreview(editingTrack);
  });
  document.getElementById('btn-edit-artwork-remove').addEventListener('click', () => {
    editingArtwork = null;
    updateEditArtworkPreview(editingTrack);
  });
  document.getElementById('btn-edit-genre-pick').addEventListener('click', openGenrePicker);
  document.getElementById('btn-edit-year-pick').addEventListener('click', openYearPicker);
  document.getElementById('btn-back-queue').addEventListener('click', () => showView('view-nowplaying'));
  const queueListEl = document.getElementById('queue-list');
  queueListEl.addEventListener('click', (e) => {
    const li = e.target.closest('.queue-row');
    if (!li || e.target.closest('.drag-handle')) return;
    const pos = Number(li.dataset.pos);
    if (e.target.closest('.track-menu-btn')) { openQueueRowMenu(pos); return; }
    const index = currentIndex + 1 + pos; // その曲から再生する(手前の曲は再生済みの扱い)
    const track = tracks.find(t => t.id === currentQueue[index]);
    if (track) loadAndPlay(track, index);
  });
  queueListEl.addEventListener('pointerdown', (e) => {
    const handle = e.target.closest('.drag-handle');
    const li = handle && handle.closest('.queue-row');
    if (!li) return;
    startRowDrag({ preventDefault: () => e.preventDefault(), currentTarget: handle, pointerId: e.pointerId, clientY: e.clientY }, li, queueListEl, (rows) => {
      const shown = currentQueue.slice(currentIndex + 1, currentIndex + 1 + QUEUE_SHOW_MAX);
      setUpcoming(rows.map(r => shown[Number(r.dataset.pos)]));
    });
  });
  document.getElementById('btn-playlist-add').addEventListener('click', openAddSongs);
  document.getElementById('btn-playlist-reorder').addEventListener('click', toggleSongEditMode);
  document.getElementById('song-sort-select').addEventListener('change', (e) => sortPlaylistSongs(e.target.value));
  document.getElementById('playlist-detail-list').addEventListener('pointerdown', (e) => {
    const handle = e.target.closest('.drag-handle');
    const li = handle && handle.closest('.edit-row');
    if (!li) return;
    startRowDrag({ preventDefault: () => e.preventDefault(), currentTarget: handle, pointerId: e.pointerId, clientY: e.clientY }, li, li.parentElement, async (rows) => {
      document.getElementById('song-sort-select').value = '';
      if (!isEditableListId(currentPlaylistId)) return;
      const shown = rows.map(r => Number(r.dataset.trackId));
      const missing = editableIds().filter(id => !shown.includes(id)); // 一覧に出なかった曲(削除済み等)は末尾に残す
      await saveEditableIds([...shown, ...missing]);
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
  document.getElementById('np-artist').addEventListener('click', () => {
    if (!currentTrack) return;
    const label = artistLabel(currentTrack);
    const groupTracks = tracks.filter(t => artistLabel(t) === label);
    openGroupDetail(label, groupTracks, 'view-artists'); // 内部でview-group-detailへ切り替わる(再生中の曲はそのまま鳴り続ける)
  });
  document.getElementById('btn-playpause').addEventListener('click', togglePlayPause);
  document.getElementById('btn-prev').addEventListener('click', playPrev);
  document.getElementById('btn-next').addEventListener('click', playNext);
  document.getElementById('btn-shuffle').addEventListener('click', toggleShuffle);
  document.getElementById('btn-repeat').addEventListener('click', cycleRepeat);
  document.getElementById('btn-speed').addEventListener('click', cycleSpeed);
  document.getElementById('btn-lyrics-toggle').addEventListener('click', toggleLyrics);
  document.getElementById('btn-np-fav').addEventListener('click', () => { if (currentTrack) toggleFavorite(currentTrack); });
  document.getElementById('btn-np-more').addEventListener('click', () => { if (currentTrack) openTrackActionSheet(currentTrack); });
  document.getElementById('btn-sleep-timer').addEventListener('click', openSleepTimerSheet);
  document.getElementById('btn-lyrics-expand').addEventListener('click', toggleLyricsExpanded);

  const seekBar = document.getElementById('seek-bar');
  seekBar.addEventListener('input', () => { seeking = true; });
  seekBar.addEventListener('change', () => {
    if (audioEl.duration) audioEl.currentTime = (seekBar.value / 1000) * audioEl.duration;
    seeking = false;
  });
}

// ===== ファイル取り込み(ID3解析) =====
const IMPORT_CONCURRENCY = 6; // 同時並列処理数(多すぎるとiOS Safariでメモリ逼迫のおそれ)

function makeSourceKey(file) {
  return `${file.name}_${file.size}_${file.lastModified}`;
}
// 更新日時を除いた「名前_大きさ」。LocalSendやiCloudでコピーし直すと更新日時が変わるので、同じ曲を二重に取り込まないために使う
const sourceKeyBase = (key) => String(key).replace(/_\d+$/, '');

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

// 取り込み用の読み取り。MP3(ID3v2)は、jsmediatagsを使わず自前でフレームを直接デコードする(文字・画像とも1回の読み込みで済み、数倍速い)
async function readTagsForImport(file) {
  let fast = null;
  try { fast = await FastTags.readAll(file); } catch (err) { fast = null; }
  if (fast) return fast;
  const tags = await readTags(file); // MP3以外(m4a・flacなど)や、未同期化タグなど特殊な形式は、今までの(jsmediatagsの)読み方
  return { tags, artworkBlob: pictureToBlob(tags.picture) };
}
async function fastDuration(file) {
  try {
    const d = await FastTags.mp3Duration(file);
    if (d) return d;
  } catch (err) { /* audio要素での読み込みに切り替える */ }
  return getAudioDuration(file);
}

async function importOneFile(file, sourceKey, orderHint) {
  const [{ tags, artworkBlob }, duration] = await Promise.all([readTagsForImport(file), fastDuration(file)]);
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
  return track; // 一覧用の小さな画像は、取り込みが終わってから、裏でまとめて作る(migrateThumbs)
}

async function handleFilesSelected(fileList) {
  const files = Array.from(fileList);
  if (files.length === 0) return;
  const progressEl = document.getElementById('import-progress');
  progressEl.classList.remove('hidden');

  const existingKeys = new Set(tracks.map(t => t.sourceKey).filter(Boolean).map(sourceKeyBase));
  const targets = [];
  let skippedCount = 0;
  for (const file of files) {
    const sourceKey = makeSourceKey(file);
    const base = sourceKeyBase(sourceKey);
    if (existingKeys.has(base)) {
      skippedCount++; // 名前と大きさが同じなら、同じ曲とみなす
    } else {
      existingKeys.add(base); // 同一選択内の重複も先に弾く
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

  // 区切りごとに待たず、空いた分から次の曲を始める(遅い曲が1つあっても、全体が止まらない)
  // 曲によっては、タグ・ジャケット画像の読み取りやデータベースへの書き込みに意外と時間がかかり、
  // 画面の描画・タップへの反応が後回しにされて「固まったように」見えることがあるため、
  // 1曲処理するごとに、描画のタイミングで必ず画面へ処理を返す
  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < targets.length) {
      const i = nextIndex++;
      const { file, sourceKey } = targets[i];
      try {
        const track = await importOneFile(file, sourceKey, i);
        tracks.push(track);
        addedCount++;
      } catch (err) {
        console.error('取り込み失敗:', file.name, err);
        failures.push(`${file.name}(${err && err.message ? err.message : err})`);
      } finally {
        updateProgress(file.name);
        await new Promise(r => requestAnimationFrame(r));
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(IMPORT_CONCURRENCY, targets.length) }, worker));

  progressEl.classList.add('hidden');
  markLibraryChanged();
  renderTrackList(document.getElementById('search-input').value.trim());
  setTimeout(migrateThumbs, 300); // 一覧用の小さな画像を、裏で作る
  const totalSec = Math.round((Date.now() - startTime) / 1000);
  const timeText = totalSec >= 60 ? `${Math.floor(totalSec / 60)}分${totalSec % 60}秒` : `${totalSec}秒`;
  dialogAlert(`取り込み完了: 新規${addedCount}曲を追加、${skippedCount}曲は追加済みのためスキップ(所要${timeText})` +
    (failures.length > 0 ? `\n\n失敗${failures.length}件:\n${failures.slice(0, 5).join('\n')}` : '') +
    (tagReadErrors.length > 0 ? `\n\nタグ情報を取得できなかった曲${tagReadErrors.length}件:\n${tagReadErrors.slice(0, 3).join('\n')}` : ''));
}

// タグ読み取りに失敗した理由(診断用)。取り込み完了ダイアログに表示する
let tagReadErrors = [];

function readTags(file, only) {
  return new Promise((resolve) => {
    if (typeof jsmediatags === 'undefined') {
      tagReadErrors.push(`${file.name}: タグ読取ライブラリ(jsmediatags)が読み込めていません`);
      resolve({});
      return;
    }
    let done = false;
    // jsmediatagsは、壊れた/特殊なファイルでonSuccess・onErrorのどちらも呼ばないまま固まることがある。
    // そうなると取り込み全体が止まって見えるため、保険として時間切れで諦める
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      tagReadErrors.push(`${file.name}: タグの読み取りが時間切れ(ファイルが壊れている可能性)`);
      resolve({});
    }, 8000);
    const finish = (val) => { if (done) return; done = true; clearTimeout(timer); resolve(val); };
    const reader = new jsmediatags.Reader(file);
    if (only) reader.setTagsToRead(only);
    reader.read({
      onSuccess: (tag) => {
        const tags = tag.tags || {};
        if (!tags.title && !tags.artist && !tags.album) {
          tagReadErrors.push(`${file.name}: タグ形式=${tag.type || '不明'}だが中身が空(ファイルにタグ情報が無い可能性)`);
        }
        finish(tags);
      },
      onError: (err) => {
        const reason = err && (err.type ? `${err.type}${err.info ? ':' + err.info : ''}` : err.message);
        tagReadErrors.push(`${file.name}: 読取エラー(${reason || '不明'})`);
        finish({});
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
    dialogAlert(`「${track.title}」に歌詞を読み込みました${track.syncedLyrics ? '(曲に合わせて動きます)' : ''}`);
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
  dialogAlert(`歌詞インポート完了: ${matched}曲に適用(うち${syncedCount}曲は曲に合わせて動きます)${unmatchedText}`);
}

// ===== 歌詞のネット自動検索(lrclib.net) =====
const LRCLIB_BASE = 'https://lrclib.net/api';
let isAutoFetchingLyrics = false;

// 同じ曲でも、lrclibには長さ(イントロなど)の違う版が複数登録されている。曲の長さが近い版を選ばないと、歌詞のタイミングがずれる
const LYRIC_DURATION_TOLERANCE = 3; // 秒。これ以内なら「同じ版」とみなす

// 日本語(ひらがな/カタカナ/漢字)を含むかどうか
function containsJapanese(s) {
  return !!(s && /[぀-ヿ㐀-鿿]/.test(s));
}

// タイトル文字列の緩い正規化(空白・記号を除去して比較しやすくする)
function normalizeForMatch(s) {
  return (s || '').normalize('NFKC').toLowerCase()
    .replace(/[\s\-.,!?()\[\]・～~'’"“”:;/_]+/g, '');
}

// 曲名・アーティスト名が日本語を含むのに、歌詞に日本語が全く含まれない場合は
// 別言語の無関係な曲を誤って拾った可能性が高いため採用しない
function lyricsLanguageMismatch(query, candidate) {
  const queryIsJapanese = containsJapanese(query.artist) || containsJapanese(query.title);
  if (!queryIsJapanese) return false;
  const text = candidate.syncedLyrics || candidate.plainLyrics || '';
  return !containsJapanese(text);
}

// lrclibの検索はあいまいマッチのため、曲名がある程度一致しているかも確認する
// (一致が全く無いのに長さだけ近いという理由で無関係な曲を拾うのを防ぐ)
function titleRoughlyMatches(queryTitle, candidateTitle) {
  const a = normalizeForMatch(queryTitle);
  const b = normalizeForMatch(candidateTitle);
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}

async function fetchLrcFromLrclib(artist, title, duration) {
  const searchUrl = `${LRCLIB_BASE}/search?artist_name=${encodeURIComponent(artist)}&track_name=${encodeURIComponent(title)}`;
  const res = await fetch(searchUrl);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const query = { artist, title };
  const list = (await res.json()).filter(r =>
    !r.instrumental &&
    (r.syncedLyrics || r.plainLyrics) &&
    titleRoughlyMatches(title, r.trackName) &&
    !lyricsLanguageMismatch(query, r));
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
  if (isAutoFetchingLyrics) { dialogAlert('すでに検索中です'); return; }
  const idx = await showChoiceSheet('歌詞をネットから自動検索', [
    '歌詞が無い曲を検索',
    '時刻付き歌詞を、曲の長さに合う版で入れ直す(ずれ直し)',
    '日本語の曲なのに歌詞が別の言語になっているものを修正',
  ]);
  if (idx < 0) return;
  const resync = idx === 1;
  const fixMismatch = idx === 2;
  let targets;
  if (fixMismatch) {
    targets = tracks.filter(t => t.lyrics &&
      (containsJapanese(t.artist) || containsJapanese(t.title)) &&
      !containsJapanese(t.lyrics));
  } else if (resync) {
    targets = tracks.filter(t => t.syncedLyrics && t.syncedLyrics.length > 0 && !t.lyricsDurationMatched);
  } else {
    targets = tracks.filter(t => !t.lyrics);
  }
  if (targets.length === 0) {
    dialogAlert(fixMismatch ? '言語が合わなそうな歌詞の曲はありません' : resync ? '入れ直す対象の曲はありません' : '歌詞が無い曲はありません');
    return;
  }
  const message = fixMismatch
    ? `曲名/アーティストが日本語なのに歌詞に日本語が含まれない${targets.length}曲について、歌詞を取得し直します(見つからない場合は歌詞なしに戻ります)。始めますか?`
    : resync
    ? `時刻付き歌詞のある${targets.length}曲について、曲の長さに合う版を探して入れ直します。長さの合う版が見つかった曲だけ差し替え、見つからない曲は今のままです(手動で読み込んだ歌詞ファイルも、合う版が見つかれば入れ替わります)。数分〜十数分かかります。アプリを開いたまま待つ必要があります。始めますか?`
    : `歌詞が無い${targets.length}曲をネットで自動検索します。曲数によっては数分〜十数分かかります。アプリを開いたまま待つ必要があります。始めますか?`;
  if (!dialogConfirm(message)) return;

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
      if (fixMismatch) {
        // 間違った言語の歌詞を一旦クリアしてから検索(古いデータが残らないようにする)
        track.lyrics = ''; track.syncedLyrics = null;
      }
      const result = await applyLyricsFromNet(track, resync);
      if (result) { found++; if (result === 'synced') syncedCount++; }
      else { notFound++; if (fixMismatch) await DB.updateTrack(track); }
    } catch (err) {
      console.error('歌詞検索失敗:', track.title, err);
      errorCount++;
    }
    await new Promise(r => setTimeout(r, 250)); // lrclib.netへの負荷・レート制限を避けるための間隔
  }

  isAutoFetchingLyrics = false;
  progressEl.classList.add('hidden');
  if (currentTrack) { lastActiveLyricIdx = -1; updateLyricsPane(); }
  dialogAlert(`歌詞自動検索完了: ${found}曲ヒット(うち${syncedCount}曲は曲に合わせて動きます) / 見つからず${notFound}曲 / エラー${errorCount}件`);
}

// ===== 年代・ジャンル情報の再スキャン(既存曲にyear/genreを補完) =====
let isRescanningTags = false;

async function rescanYearGenreTags() {
  if (isRescanningTags) { dialogAlert('すでに実行中です'); return; }
  const targets = tracks.filter(t => !t.readingsScanned || !t.artworkScanned || !t.year || !t.genre || t.artist === UNKNOWN_ARTIST);
  if (targets.length === 0) { dialogAlert('すべての曲にタグ情報があります(または元々タグが無く再取得できません)'); return; }
  if (!dialogConfirm(`${targets.length}曲のアーティスト・年代・ジャンル・読み(並び替え用)・ジャケット画像を再スキャンします。曲数によっては数分かかることがあります。始めますか?`)) return;

  isRescanningTags = true;
  const progressEl = document.getElementById('import-progress');
  progressEl.classList.remove('hidden');
  let updated = 0;

  for (let i = 0; i < targets.length; i += IMPORT_CONCURRENCY) {
    const chunk = targets.slice(i, i + IMPORT_CONCURRENCY);
    progressEl.textContent = `年代・ジャンルを再スキャン中... ${Math.min(i + IMPORT_CONCURRENCY, targets.length)}/${targets.length}曲`;
    await Promise.all(chunk.map(async (track) => {
      try {
        const { tags, artworkBlob: scannedArtwork } = await readTagsForImport(track.fileBlob); // MP3ならjsmediatagsを使わない高速な読み取り
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
            if (scannedArtwork) {
              track.artworkBlob = scannedArtwork;
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
  dialogAlert(`再スキャン完了: ${updated}/${targets.length}曲のタグ情報(年代・ジャンル・読みなど)を更新しました`);
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

// 特撮ジャンルの曲を、シリーズ(ウルトラマン / 仮面ライダー / スーパー戦隊)にまとめる。アルバム名・曲名・アーティスト名に含まれる言葉で判定する
const TOKUSATSU_GENRE_RE = /^(特撮|とくさつ|tokusatsu)$/;
// どのシリーズも、「戦隊」「レンジャー」「ウルトラ」「仮面」「ライダー」のような共通の言葉が付かない作品(ジェットマン・ティガ・クウガ等)があるため、
// 歴代の呼び名を列挙して補う。3つのリストの言葉どうしで重ならないように選んである(重なると誤って別シリーズに分類されてしまうため)
const SENTAI_TEAM_NAMES = /ゴレンジャー|ジャッカー|バトルフィーバー|デンジマン|サンバルカン|ゴーグルファイブ|ダイナマン|バイオマン|チェンジマン|フラッシュマン|マスクマン|ライブマン|ターボレンジャー|ファイブマン|ジェットマン|ジュウレンジャー|ダイレンジャー|カクレンジャー|オーレンジャー|カーレンジャー|メガレンジャー|ギンガマン|ゴーゴーファイブ|タイムレンジャー|ガオレンジャー|ハリケンジャー|アバレンジャー|デカレンジャー|マジレンジャー|ボウケンジャー|ゲキレンジャー|ゴーオンジャー|シンケンジャー|ゴセイジャー|ゴーカイジャー|ゴーバスターズ|キョウリュウジャー|トッキュウジャー|ニンニンジャー|ジュウオウジャー|キュウレンジャー|ルパンレンジャー|パトレンジャー|リュウソウジャー|キラメイジャー|ゼンカイジャー|ドンブラザーズ|キングオージャー|ブンブンジャー/;
// 「ダイナ」「ゼロ」「ギンガ」のように他シリーズの名前(ダイナマン・ゼロワン・ギンガマン等)に含まれてしまう短い呼び名は、あえて入れていない
const ULTRA_HERO_NAMES = /ティガ|ガイア|コスモス|ネクサス|マックス|メビウス|エックス|オーブ|ジード|タイガ|トリガー|デッカー|ブレーザー|アーク|セブン|タロウ|レオ|アストラ|ゾフィー|ジャスティス/;
const RIDER_HERO_NAMES = /クウガ|アギト|龍騎|ファイズ|ブレイド|響鬼|カブト|電王|キバ|ディケイド|ダブル|オーズ|フォーゼ|ウィザード|鎧武|ガイム|ドライブ|ゴースト|エグゼイド|ビルド|ジオウ|ゼロワン|セイバー|リバイス|ギーツ|ガッチャード/;
const TOKUSATSU_SERIES = [
  { label: 'ウルトラマン', re: new RegExp(`ウルトラ|${ULTRA_HERO_NAMES.source}`) },
  { label: '仮面ライダー', re: new RegExp(`仮面|ライダー|${RIDER_HERO_NAMES.source}`) },
  { label: 'スーパー戦隊', re: new RegExp(`戦隊|レンジャー|${SENTAI_TEAM_NAMES.source}`) }, // 「戦隊」「レンジャー」を含む題名 + 歴代チーム名(短い表記のみのタグにも対応)
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
  renderAlbumList();
}

// 「名前 + 曲数 + ジャケット」の行の一覧を、HTML文字列で一括生成する。クリックは一覧全体で1回だけ受ける
// rows: [{ name, count, artUrl, section, onClick }]
// sectioned=true のときだけ、頭文字ごとの見出し行(あ・か・さ…)を挟む(あいうえお順の本物の索引バーが出る一覧だけで使う)
function fillGroupRows(listEl, rows, sectioned = false) {
  clearTimeout(listEl._renderTimer); // 曲一覧の段階描画が残っていれば止める
  listEl._flushRows = null;
  listEl._rows = rows;
  let lastSection = null;
  listEl.innerHTML = rows.map((r, i) => {
    // section が無い行(「すべての曲」などの固定行)は、見出しを挟まず、直前のセクションも更新しない
    const header = (sectioned && r.section && r.section !== lastSection) ? `<li class="section-header-row" data-section="${esc(r.section)}">${esc(r.section)}</li>` : '';
    if (r.section) lastSection = r.section;
    return header +
      `<li class="playlist-item" data-i="${i}" data-section="${esc(r.section)}">` +
      `<img class="playlist-artwork" loading="lazy" decoding="async" src="${r.artUrl}" alt="">` +
      `<div class="track-meta"><div class="playlist-name">${esc(r.name)}</div><div class="playlist-count">${r.count}曲</div></div></li>`;
  }).join('');
  refreshPlainScrollbarIfActive();
  if (listEl._rowsBound) return;
  listEl._rowsBound = true;
  listEl.addEventListener('click', (e) => {
    const li = e.target.closest('.playlist-item');
    if (!li || !listEl.contains(li)) return;
    const row = listEl._rows && listEl._rows[Number(li.dataset.i)];
    if (row) row.onClick();
  });
}

function renderGroupList(listElId, groupFn, sortFn, keyFn, cacheKey = '', filter = '') {
  const listEl = document.getElementById(listElId);
  const ver = `${libVersion}|${cacheKey}|${filter}`;
  if (listEl._ver === ver) return; // 曲が変わっていなければ、前回の一覧をそのまま使う
  listEl._ver = ver;
  const groups = new Map(); // label -> track[]
  tracks.forEach((t) => {
    const label = groupFn(t);
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(t);
  });
  const backView = { 'year-list': 'view-years', 'genre-list': 'view-genres', 'artist-list': 'view-artists', 'album-list': 'view-albums' }[listElId];
  const f = filter.trim().toLowerCase();
  // 名前(アーティスト名など)か、中の曲のタイトルのどちらかに一致すれば残す
  const keys = f ? [...groups.keys()].filter(label => label.toLowerCase().includes(f) || groups.get(label).some(t => t.title.toLowerCase().includes(f))) : [...groups.keys()];
  const rows = keys.sort(sortFn || defaultLabelSort).map((label) => {
    const groupTracks = groups.get(label);
    return {
      name: label,
      count: groupTracks.length,
      artUrl: getThumbUrl(groupTracks.find(t => t.artworkBlob) || groupTracks[0]),
      section: sectionOf(keyFn ? keyFn(label) : label),
      onClick: () => openGroupDetail(label, groupTracks, backView),
    };
  });
  // artist-list / album-list だけ、本物のあいうえお順の索引バーが出る(year-list/genre-listは年・ジャンル順で、索引とは合わないため挟まない)
  fillGroupRows(listEl, rows, listElId === 'artist-list' || listElId === 'album-list');
}

function renderYearList() { renderGroupList('year-list', yearLabel, yearSortFn, null, yearSortOrder); }
function renderGenreList() { renderGroupList('genre-list', genreLabel); }

function artistLabel(track) {
  return track.artist && track.artist.trim() && track.artist !== UNKNOWN_ARTIST ? track.artist.trim() : '不明';
}
function renderArtistList(filter = '') {
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
  }, keyOf, '', filter);

  // ライブラリと同じく、一覧の先頭に「再生 / シャッフル」を出す(今の絞り込みに一致する曲すべてが対象)
  const listEl = document.getElementById('artist-list');
  const old = listEl.querySelector('.play-row');
  if (old) old.remove();
  const f = filter.trim().toLowerCase();
  const ids = tracks
    .filter(t => !f || artistLabel(t).toLowerCase().includes(f) || t.title.toLowerCase().includes(f))
    .slice().sort((a, b) => sectionSort(trackSortKey(a), trackSortKey(b)))
    .map(t => t.id);
  if (ids.length > 0) listEl.insertBefore(buildPlayRow(ids), listEl.firstChild);
}

function renderAlbumList(filter = '') {
  // アルバムの読み(TSOA)があれば、それで並べる。無ければ表記そのまま
  const reading = new Map();
  tracks.forEach((t) => {
    const a = albumLabel(t);
    if (t.albumSort && !reading.has(a)) reading.set(a, t.albumSort);
  });
  const keyOf = (a) => reading.get(a) || a;
  renderGroupList('album-list', albumLabel, (a, b) => {
    if (a === 'アルバム不明') return 1;
    if (b === 'アルバム不明') return -1;
    return sectionSort(keyOf(a), keyOf(b));
  }, keyOf, '', filter);

  // ライブラリと同じく、一覧の先頭に「再生 / シャッフル」を出す(今の絞り込みに一致する曲すべてが対象)
  const listEl = document.getElementById('album-list');
  const old = listEl.querySelector('.play-row');
  if (old) old.remove();
  const f = filter.trim().toLowerCase();
  const ids = tracks
    .filter(t => !f || albumLabel(t).toLowerCase().includes(f) || t.title.toLowerCase().includes(f))
    .slice().sort((a, b) => sectionSort(trackSortKey(a), trackSortKey(b)))
    .map(t => t.id);
  if (ids.length > 0) listEl.insertBefore(buildPlayRow(ids), listEl.firstChild);
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
  } else if (backView === 'view-albums') {
    filterEl.classList.add('hidden');
    regionEl.classList.add('hidden');
    // アルバム内は、曲順の情報を持っていないので、曲名のあいうえお順で並べる(ジャンルのアルバム一覧と同じ)
    renderGroupDetailList(groupTracks.slice().sort((a, b) => sectionSort(trackSortKey(a), trackSortKey(b))));
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

// group-detail-list は、年代からの絞り込みと、ジャンル→アルバムの曲一覧の両方で使う。
// どちらも、あいうえお順の本物の索引バーが出る(refreshIndexTargetの判定と合わせること)ので、見出し行を挟む
function groupDetailHasIndex() {
  return lastGroupListView === 'view-years' || (lastGroupListView === 'view-genres' && genreCtx && genreCtx.album !== null);
}
function renderGroupDetailList(list) {
  setGroupMode('tracks');
  const listEl = document.getElementById('group-detail-list');
  fillTrackList(listEl, list, list.map(t => t.id), groupDetailHasIndex());
  refreshPlainScrollbarIfActive();
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
  // 特撮ジャンルなら、アルバム一覧の前に「ウルトラマン」「仮面ライダー」「スーパー戦隊」の行を出す
  // (「すべての曲」と合わせて固定行なので、あいうえお順の見出しには含めない)
  const seriesRows = [];
  if (groupTracks.some(isTokusatsu)) {
    TOKUSATSU_SERIES.forEach((d) => {
      const list = groupTracks.filter(t => tokusatsuSeries(t) === d.label);
      if (list.length > 0) seriesRows.push({ ...toRow(d.label, list, () => openGenreAlbumTracks(d.label, list)), section: null });
    });
  }
  fillGroupRows(listEl, [
    { ...toRow('すべての曲', groupTracks, () => openGenreAlbumTracks('すべての曲', groupTracks)), section: null },
    ...seriesRows,
    ...albums.map(a => toRow(a, groups.get(a), () => openGenreAlbumTracks(a, groups.get(a)))),
  ], true);
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
  for (let i = 0; i < todo.length; i += 4) {
    const results = await Promise.all(todo.slice(i, i + 4).map(saveThumb));
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
  fillTrackList(listEl, filtered, filtered.map(t => t.id), true);
}

// ===== 右端のインデックスバー(あ〜わ / A〜Z / #) =====
const INDEX_LABELS = [...'あかさたなはまやらわ', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ', '#'];
const INDEX_VIEWS = { 'view-library': 'track-list', 'view-artists': 'artist-list', 'view-albums': 'album-list', 'view-add-songs': 'add-songs-list' }; // バーを出す画面 → 対象の一覧
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
    const v = listEl._v;
    const idx = v.list.findIndex(row => {
      const sec = row.h ? (row.h === 'header' ? row.label : sectionOf(trackSortKey(row.track))) : sectionOf(trackSortKey(row));
      return SECTION_INDEX.get(sec) >= target;
    });
    if (idx < 0) return;
    view.scrollTop = listTop() + headHeight(listEl) + v.offsets[idx] - offset;
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
    if (label !== lastLabel) { // 文字が変わったときだけ(見出し行が一覧の中に実際にあるので、浮かせたバブルは出さない)
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
// ===== 前回の続きから再生: 曲・再生位置・再生待ち・シャッフル/リピートを覚えておく =====
const PLAYBACK_KEY = 'mmPlayback';
let lastPlaybackSave = 0;
function savePlaybackState(force) {
  if (!currentTrack) return;
  const now = Date.now();
  if (!force && now - lastPlaybackSave < 5000) return;
  lastPlaybackSave = now;
  try {
    localStorage.setItem(PLAYBACK_KEY, JSON.stringify({
      trackId: currentTrack.id, pos: audioEl.currentTime || 0,
      queue: currentQueue, base: baseQueue, index: currentIndex, shuffle: isShuffle, repeat: repeatMode,
    }));
  } catch (e) { /* 保存できなくても、再生には影響しない */ }
}

function setRepeatUI() {
  const btn = document.getElementById('btn-repeat');
  btn.classList.toggle('active', repeatMode !== 'off');
  btn.innerHTML = svgIcon(ICON_PATHS[repeatMode === 'one' ? 'repeatOne' : 'repeat'], 24);
}

// 起動時: 最後に聴いていた曲を、一時停止の状態で用意する(自動では再生しない)。ミニプレイヤーの▶で続きから
function restorePlaybackState() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(PLAYBACK_KEY)); } catch (e) { /* 無ければ何もしない */ }
  if (!saved) return;
  const track = tracks.find(t => t.id === saved.trackId);
  if (!track) return;
  const ids = new Set(tracks.map(t => t.id));
  currentQueue = (saved.queue || []).filter(id => ids.has(id));
  baseQueue = (saved.base || []).filter(id => ids.has(id));
  if (!currentQueue.includes(track.id)) { currentQueue = [track.id]; baseQueue = [track.id]; }
  currentIndex = currentQueue[saved.index] === track.id ? saved.index : currentQueue.indexOf(track.id);
  isShuffle = !!saved.shuffle;
  document.getElementById('btn-shuffle').classList.toggle('active', isShuffle);
  repeatMode = saved.repeat === 'all' || saved.repeat === 'one' ? saved.repeat : 'off';
  setRepeatUI();
  currentTrack = track;
  setSource(audioEl, track);
  const pos = Number(saved.pos) || 0;
  audioEl.addEventListener('loadedmetadata', () => {
    if (pos > 0 && pos < audioEl.duration) audioEl.currentTime = pos; // 続きの位置へ
  }, { once: true });
  updateNowPlayingUI();
  updateMediaSession();
  showMiniPlayer();
  refreshPlayingHighlight();
  setPlayPauseIcon(false);
  document.getElementById('np-current-time').textContent = formatTime(pos);
}

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

// ===== ライブラリの複数選択(「選択」モード中だけ、チェックボックスを出して一括操作する) =====
let selectMode = false;
let selectedIds = new Set();

// 1曲分の行。要素を1つずつ作るより、HTML文字列にして一括で挿入するほうがはるかに速い
function trackItemHTML(track) {
  const playing = currentTrack && currentTrack.id === track.id;
  const sel = selectMode && selectedIds.has(track.id);
  const checkbox = selectMode ? `<span class="select-check${sel ? ' on' : ''}"></span>` : '';
  return `<li class="track-item${playing ? ' playing' : ''}${selectMode ? ' select-mode' : ''}${sel ? ' selected' : ''}" data-track-id="${track.id}" data-section="${esc(sectionOf(trackSortKey(track)))}">` +
    checkbox +
    `<img class="track-artwork" loading="lazy" decoding="async" src="${getThumbUrl(track)}" alt="">` +
    `<div class="track-meta"><div class="track-title">${esc(track.title)}</div><div class="track-artist">${esc(track.artist)}</div></div>` +
    `${track.favorite ? '<span class="fav-mark">★</span>' : ''}<button class="track-menu-btn">⋯</button></li>`;
}

// 行を段階的に挿入する。最初の一部だけ先に表示して、残りは少しずつ追加する(数千曲でも画面が固まらない)
// ===== 仮想スクロール: 画面に見えている範囲の前後の行だけを描画する(数千曲でも行数は約100に保つ) =====
const ROW_H = 63;         // 曲の行の高さ(CSSの .track-item と一致させる)
const PLAY_H = 64;        // 先頭の「再生/シャッフル」行の高さ(CSSの .play-row と一致させる)
const HEADER_ROW_H = 32;  // 「あ」「か」…の見出し行の高さ(CSSの .section-header-row と一致させる)
const V_BUFFER = 30;      // 見えている範囲の上下に、余分に描画しておく行数(速いスクロールで空白が出ないように)

// 一覧の先頭にある「再生/シャッフル」行の高さ(曲を追加する画面のように、無い一覧は0)
const headHeight = (listEl) => (listEl.querySelector(':scope > .play-row') ? PLAY_H : 0);

// 曲の配列から、頭文字(あ・か・さ…)が変わるたびに見出し行を挟んだ配列を作る(本物のApple Musicと同じ見た目)。
// 一覧はすでに sectionSort 済みであること
function buildSectionedRows(list) {
  const rows = [];
  let last = null;
  for (const track of list) {
    const sec = sectionOf(trackSortKey(track));
    if (sec !== last) { rows.push({ h: 'header', label: sec }); last = sec; }
    rows.push({ h: 'track', track });
  }
  return rows;
}
const sectionedRowHeight = (row) => (row.h === 'header' ? HEADER_ROW_H : ROW_H);
// 見出し行付きの一覧用のrowFnを作る(曲1件分のHTMLは、一覧ごとに違うrowFn(trackItemHTML / addRowHTMLなど)に任せる)
function makeSectionedRowFn(trackRowFn) {
  return (row) => (row.h === 'header' ? `<li class="section-header-row">${esc(row.label)}</li>` : trackRowFn(row.track));
}

// 各行の高さから、先頭からの累積オフセット(px)を作る。rows.length+1件(末尾は合計の高さ)
function buildRowOffsets(rows, heightFn) {
  const offsets = new Array(rows.length + 1);
  offsets[0] = 0;
  for (let i = 0; i < rows.length; i++) offsets[i + 1] = offsets[i] + heightFn(rows[i]);
  return offsets;
}
// 累積オフセットの中から、「位置yの時点で何番目の行か」を二分探索で求める(行の高さが揃っていなくても使える)
function indexAtOffset(offsets, y) {
  if (y <= 0) return 0;
  let lo = 0, hi = offsets.length - 2;
  if (hi < 0) return 0;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (offsets[mid] <= y) lo = mid; else hi = mid - 1;
  }
  return lo;
}

function updateVirtualWindow(listEl, force) {
  const v = listEl._v;
  if (!v || listEl.getClientRects().length === 0) return; // 表示されていない一覧は更新しない
  const view = listEl.closest('.view');
  if (!view) return;
  const listTop = listEl.getBoundingClientRect().top - view.getBoundingClientRect().top + view.scrollTop;
  const relTop = Math.max(0, view.scrollTop - listTop - headHeight(listEl));
  const relBottom = relTop + view.clientHeight;
  const n = v.list.length;
  const offsets = v.offsets;
  const needStart = indexAtOffset(offsets, relTop);
  const needEnd = Math.min(n, indexAtOffset(offsets, relBottom) + 1);
  // 必要な範囲が、描画済みの範囲(の内側に余裕を持たせた範囲)に収まっていれば、何もしない
  if (!force && v.start >= 0 && v.start <= Math.max(0, needStart - Math.ceil(V_BUFFER / 3)) && v.end >= Math.min(n, needEnd + Math.ceil(V_BUFFER / 3))) return;
  const start = Math.max(0, needStart - V_BUFFER);
  const end = Math.min(n, needEnd + V_BUFFER);
  while (v.top.nextSibling && v.top.nextSibling !== v.bottom) v.top.nextSibling.remove();
  v.bottom.insertAdjacentHTML('beforebegin', v.list.slice(start, end).map(v.rowFn).join(''));
  v.top.style.height = `${offsets[start]}px`;
  v.bottom.style.height = `${offsets[n] - offsets[end]}px`;
  v.start = start;
  v.end = end;
}

// rowFn/heightFnを省略すると、曲が均等な高さで並ぶ今まで通りの一覧になる
function renderVirtualList(listEl, list, rowFn, heightFn) {
  const rf = rowFn || listEl._rowFn || trackItemHTML;
  const hf = heightFn || (() => ROW_H);
  const top = document.createElement('li');
  const bottom = document.createElement('li');
  top.className = bottom.className = 'v-spacer';
  listEl.append(top, bottom);
  listEl._v = { list, top, bottom, start: -1, end: -1, rowFn: rf, offsets: buildRowOffsets(list, hf) };
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
// sectioned=true のときだけ、頭文字ごとの見出し行(あ・か・さ…)を挟む(並び順があいうえお順の一覧だけで使う。
// プレイリストのような手動の並び順では、見出しを挟むとバラバラに見えてしまうため使わない)
function fillTrackList(listEl, list, ids, sectioned = false) {
  listEl.innerHTML = '';
  listEl._queueIds = ids;
  listEl._v = null;
  if (list.length > 0) listEl.appendChild(buildPlayRow(ids));
  if (sectioned) renderVirtualList(listEl, buildSectionedRows(list), makeSectionedRowFn(trackItemHTML), sectionedRowHeight);
  else renderVirtualList(listEl, list);
  if (listEl._clickBound) return;
  listEl._clickBound = true;
  listEl.addEventListener('click', (e) => {
    const li = e.target.closest('.track-item');
    if (!li || !listEl.contains(li)) return;
    const track = tracks.find(t => String(t.id) === li.dataset.trackId);
    if (!track) return;
    if (selectMode && listEl.id === 'track-list') { toggleTrackSelected(track.id, li); return; }
    if (e.target.closest('.track-menu-btn')) openTrackActionSheet(track);
    else playTrackById(track.id, listEl._queueIds);
  });
}

// ライブラリ画面の「⋯」: 普段あまり使わない操作をまとめる(トップバーのボタンが増えすぎないように)
async function openLibraryMoreSheet() {
  const options = ['年代・ジャンル情報を再スキャン', '歌詞をネットから自動検索', '歌詞ファイルを一括読み込み'];
  const idx = await showChoiceSheet('その他の操作', options);
  if (idx < 0) return;
  if (idx === 0) rescanYearGenreTags();
  else if (idx === 1) autoFetchLyrics();
  else if (idx === 2) document.getElementById('lyrics-file-input').click();
}

function toggleSelectMode() {
  if (selectMode) { exitSelectMode(); return; }
  selectMode = true;
  document.getElementById('btn-select-mode').textContent = '完了';
  document.getElementById('view-library').classList.add('select-mode-active');
  document.body.classList.add('select-mode-active');
  renderTrackList(document.getElementById('search-input').value.trim());
  updateSelectBar();
}

function exitSelectMode() {
  selectMode = false;
  selectedIds.clear();
  document.getElementById('btn-select-mode').textContent = '選択';
  document.getElementById('view-library').classList.remove('select-mode-active');
  document.body.classList.remove('select-mode-active');
  renderTrackList(document.getElementById('search-input').value.trim());
  updateSelectBar();
}

function toggleTrackSelected(id, li) {
  if (selectedIds.has(id)) selectedIds.delete(id); else selectedIds.add(id);
  if (li) {
    li.classList.toggle('selected', selectedIds.has(id));
    const chk = li.querySelector('.select-check');
    if (chk) chk.classList.toggle('on', selectedIds.has(id));
  }
  updateSelectBar();
}

function toggleSelectAll() {
  const ids = document.getElementById('track-list')._queueIds || [];
  if (selectedIds.size === ids.length) selectedIds.clear();
  else selectedIds = new Set(ids);
  renderTrackList(document.getElementById('search-input').value.trim());
  updateSelectBar();
}

function updateSelectBar() {
  const n = selectedIds.size;
  document.getElementById('select-action-bar').classList.toggle('hidden', !selectMode);
  document.getElementById('select-count').textContent = n > 0 ? `${n}曲を選択中` : '曲を選んでください';
  const ids = document.getElementById('track-list')._queueIds || [];
  document.getElementById('btn-select-all').textContent = n > 0 && n === ids.length ? '全解除' : '全選択';
  ['btn-select-fav', 'btn-select-addpl', 'btn-select-delete'].forEach(id => { document.getElementById(id).disabled = n === 0; });
}

// お気に入りに追加(選んだ曲をまとめて)。既にお気に入りの曲はそのまま
async function bulkFavoriteSelected() {
  const ids = [...selectedIds];
  for (const id of ids) {
    const t = tracks.find(x => x.id === id);
    if (t && !t.favorite) { t.favorite = true; await DB.updateTrack(t); }
  }
  renderPlaylistList();
  exitSelectMode();
  showToast(`${ids.length}曲をお気に入りに追加しました`);
}

// プレイリストに追加(選んだ曲をまとめて)
async function bulkAddSelectedToPlaylist() {
  const ids = [...selectedIds];
  if (ids.length === 0) return;
  if (playlists.length === 0) {
    const name = dialogPrompt('プレイリストがありません。新規作成しますか?名前を入力してください');
    if (!name || !name.trim()) return;
    const playlist = { name: name.trim(), trackIds: ids.slice(), createdAt: Date.now() };
    const plId = await DB.addPlaylist(playlist);
    playlist.id = plId;
    playlists.push(playlist);
    renderPlaylistList();
    exitSelectMode();
    showToast(`${ids.length}曲を追加しました`);
    return;
  }
  const idx = await showChoiceSheet('追加先のプレイリスト', playlists.map(p => p.name));
  if (idx < 0) return;
  const pl = playlists[idx];
  let added = 0;
  ids.forEach(id => { if (!pl.trackIds.includes(id)) { pl.trackIds.push(id); added++; } });
  await DB.updatePlaylist(pl);
  renderPlaylistList();
  exitSelectMode();
  showToast(`${added}曲を追加しました`);
}

// ライブラリから削除(選んだ曲をまとめて)
async function bulkDeleteSelected() {
  const ids = [...selectedIds];
  const done = await deleteTracksFromLibrary(ids);
  if (done) { exitSelectMode(); showToast(`${ids.length}曲を削除しました`); }
}

// ===== alert/confirm/prompt の置き換え =====
// iOSでは、曲の再生中にこれらのダイアログを出すと、表示している間に再生が止まり、閉じても自動では再開しない。
// 必ずこの3つ経由で呼ぶことで、再生中だったときだけ、閉じたあとに自動で再開する
function dialogWasPlaying() { return !!(currentTrack && !audioEl.paused); }
function resumePlaybackAfterDialog() {
  if (audioEl.paused) audioEl.play().catch(() => {});
}
function dialogAlert(msg) {
  const wasPlaying = dialogWasPlaying();
  window.alert(msg);
  if (wasPlaying) resumePlaybackAfterDialog();
}
function dialogConfirm(msg) {
  const wasPlaying = dialogWasPlaying();
  const result = window.confirm(msg);
  if (wasPlaying) resumePlaybackAfterDialog();
  return result;
}
function dialogPrompt(msg, def) {
  const wasPlaying = dialogWasPlaying();
  const result = window.prompt(msg, def);
  if (wasPlaying) resumePlaybackAfterDialog();
  return result;
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

const isPlaylistDetailActive = () => document.getElementById('view-playlist-detail').classList.contains('active');

async function openTrackActionSheet(track) {
  const options = [track.favorite ? 'お気に入りから外す' : 'お気に入りに追加', '次に再生', '最後に再生', 'プレイリストに追加', '曲情報を編集', '季節を設定(春夏秋冬)', '歌詞ファイルを読み込む', '歌詞をネットで再検索'];
  if (track.syncedLyrics && track.syncedLyrics.length > 0) options.push('曲の頭の無音からずれを調整'); // 時刻付きの歌詞がある曲だけ
  if (isPlaylistDetailActive() && isEditableListId(currentPlaylistId)) options.push('このプレイリストから削除'); // プレイリストの画面を開いているときだけ(ライブラリなどでは出さない)
  options.push('ライブラリから削除');
  const idx = await showChoiceSheet(track.title, options);
  if (idx < 0) return;
  const label = options[idx];
  if (label === 'お気に入りに追加' || label === 'お気に入りから外す') toggleFavorite(track);
  else if (label === '次に再生') enqueue(track, true);
  else if (label === '最後に再生') enqueue(track, false);
  else if (label === 'プレイリストに追加') addTrackToPlaylistPrompt(track.id);
  else if (label === '曲情報を編集') openEditTrack(track);
  else if (label === '季節を設定(春夏秋冬)') setTrackSeason(track);
  else if (label === '歌詞ファイルを読み込む') importLyricsForTrack(track);
  else if (label === '歌詞をネットで再検索') refetchLyrics(track);
  else if (label === '曲の頭の無音からずれを調整') estimateSilenceOffset(track);
  else if (label === 'このプレイリストから削除') removeTrackFromCurrentPlaylist(track.id);
  else if (label === 'ライブラリから削除') deleteTrackFromLibrary(track.id);
}

// 曲の頭にある無音の長さを検出し、歌詞の1行目の時刻と比べて、「ずれ」の目安を提案する
// (イントロの長さが、歌詞データの元になった版と、手元のファイルとで違う場合に有効)
async function estimateSilenceOffset(track) {
  const firstLine = (track.syncedLyrics || []).find(l => l.text && l.text.trim());
  if (!firstLine) { dialogAlert('歌詞の1行目が見つかりませんでした'); return; }
  let silence;
  try {
    silence = await AudioEngine.detectLeadSilence(track.fileBlob);
  } catch (err) {
    console.error('無音の検出に失敗:', track.title, err);
    dialogAlert('この曲は解析できませんでした(対応していない形式の可能性があります)');
    return;
  }
  const cur = track.lyricOffset || 0;
  const newOffset = Math.round((firstLine.time - silence) * 10) / 10;
  if (Math.abs(newOffset - cur) < 0.15) { dialogAlert(`曲の頭の無音: 約${silence.toFixed(1)}秒。今の「ずれ」(${cur.toFixed(1)}秒)から、ほとんど変わらないので、調整しませんでした。`); return; }
  if (!dialogConfirm(`曲の頭の無音: 約${silence.toFixed(1)}秒 / 歌詞の1行目: ${firstLine.time.toFixed(1)}秒\n\n「ずれ」を ${cur.toFixed(1)}秒 → ${newOffset.toFixed(1)}秒 に変更します。よろしいですか?\n(あくまで目安です。合わない場合は、あとで「タップで合わせる」で直せます)`)) return;
  track.lyricOffset = newOffset;
  await DB.updateTrack(track);
  if (currentTrack && currentTrack.id === track.id) { lastActiveLyricIdx = -1; updateLyricsPane(); }
  dialogAlert('ずれを調整しました');
}

// この1曲だけ、曲の長さに合う歌詞をネットで検索し直す(ずれている曲の直し用)
async function refetchLyrics(track) {
  try {
    const result = await applyLyricsFromNet(track);
    if (currentTrack && currentTrack.id === track.id) { lastActiveLyricIdx = -1; updateLyricsPane(); }
    if (result === 'synced') dialogAlert('曲の長さに合う歌詞が見つかりました。曲に合わせて動きます。');
    else if (result === 'plain') dialogAlert('この曲の長さに合う「時刻付き」の歌詞は見つからず、文字だけの歌詞を登録しました(曲に合わせては動きません)。');
    else dialogAlert('この曲の歌詞は見つかりませんでした。');
  } catch (err) {
    console.error('歌詞の再検索失敗:', track.title, err);
    dialogAlert('歌詞の検索に失敗しました(通信状況を確認してください)。');
  }
}

// 削除した曲を、再生待ちから外す(現在再生中の曲は、そのまま最後まで鳴る)
function removeFromQueues(id) {
  let removedBefore = 0;
  currentQueue = currentQueue.filter((qid, i) => {
    const keep = qid !== id || (currentTrack && currentTrack.id === id && i === currentIndex);
    if (!keep && i < currentIndex) removedBefore++;
    return keep;
  });
  currentIndex -= removedBefore;
  baseQueue = baseQueue.filter(qid => qid !== id);
  renderQueueIfOpen();
}

async function deleteTrackFromLibrary(trackId) {
  return deleteTracksFromLibrary([trackId]);
}

// 複数曲まとめてライブラリから削除(確認は1回だけ)。実際に削除したら true を返す
async function deleteTracksFromLibrary(trackIds) {
  if (!trackIds || trackIds.length === 0) return false;
  const msg = trackIds.length === 1 ? 'この曲をライブラリから削除しますか?' : `選んだ${trackIds.length}曲をライブラリから削除しますか?`;
  if (!dialogConfirm(msg)) return false;
  const idSet = new Set(trackIds);
  for (const trackId of trackIds) {
    await DB.deleteTrack(trackId);
    await DB.deleteThumb(trackId);
    removeFromQueues(trackId);
    thumbMap.delete(trackId);
    thumbUrlCache.delete(trackId);
  }
  tracks = tracks.filter(t => !idSet.has(t.id));
  playlists.forEach(p => { p.trackIds = p.trackIds.filter(id => !idSet.has(id)); });
  for (const p of playlists) await DB.updatePlaylist(p);
  markLibraryChanged();
  renderTrackList(document.getElementById('search-input').value.trim());
  renderPlaylistList();
  if (isPlaylistDetailActive()) openPlaylistDetail(currentPlaylistId, playlistDetailBackView); // 開いているプレイリストの中から削除したときも、閉じ直さず即座に消す
  return true;
}

// ===== 自動の一覧(最近追加した曲 / 最近再生した曲) =====
const AUTO_LISTS = [
  { key: 'added', label: '最近追加した曲', get: () => tracks.filter(t => t.addedAt).sort((a, b) => b.addedAt - a.addedAt).slice(0, 100) },
  { key: 'played', label: '最近再生した曲', get: () => tracks.filter(t => t.lastPlayedAt).sort((a, b) => b.lastPlayedAt - a.lastPlayedAt).slice(0, 100) },
];

// ===== 令和アニソン / 平成アニソン(ジャンルが「アニメ」で、発売年で振り分ける自動の一覧) =====
// 令和: 2019年以降 / 平成: 1989〜2018年。年が無い曲や、アニメ以外のジャンルの曲は、どちらにも入らない
const ERA_LISTS = [
  { key: 'reiwaAnime', label: '令和アニソン', get: () => tracks.filter(t => originKey(t) === 'anime' && parseInt(t.year, 10) >= 2019) },
  { key: 'heiseiAnime', label: '平成アニソン', get: () => tracks.filter(t => originKey(t) === 'anime' && parseInt(t.year, 10) >= 1989 && parseInt(t.year, 10) < 2019) },
];

// ===== 季節のプレイリスト(春夏秋冬・クリスマス) =====
// 自動で振り分けた一覧だが、自分のプレイリストと同じく、曲の追加・削除・並び替え・名前の変更ができる
//  ・追加 = その曲の季節を手動で決める(track.season) / 削除 = その曲を「どれでもない」にする
//  ・並び順 = seasonOrders(季節ごとの曲idの並び)に保存。並びが未保存の曲は、曲名順で後ろに続く
//  ・名前 = seasonLabels に保存
// 曲名・アルバム名の言葉から自動で振り分ける。手動で決めた季節(track.season)があればそちらを優先する。'none' = どれでもない
const SEASONS = [
  { key: 'spring', label: '春の曲', re: /春|桜|さくら|サクラ|卒業|入学|花見|菜の花|新生活|桃の花|spring|sakura|cherry\s?blossom/gi },
  { key: 'summer', label: '夏の曲', re: /夏|花火|向日葵|ひまわり|入道雲|夕立|浴衣|蝉|海|サマー|summer|真夏|南国|プール|夏祭/gi },
  { key: 'autumn', label: '秋の曲', re: /秋|紅葉|コスモス|落ち葉|枯葉|月見|十五夜|銀杏|autumn|fall\b|ハロウィン|halloween/gi },
  { key: 'winter', label: '冬の曲', re: /冬|雪|winter|snow|粉雪|吹雪|白い息|こたつ/gi },
  { key: 'xmas', label: 'クリスマス', re: /クリスマス|christmas|x'?mas|聖夜|サンタ|ジングルベル|ノエル|きよしこの夜|もろびと|トナカイ|ルドルフ|noel|santa|jingle\s?bells?|silent\s?night|holy\s?night|rudolph|reindeer|sleigh|mistletoe|carols?|deck\s?the\s?halls?|joy\s?to\s?the\s?world|let\s?it\s?snow|winter\s?wonderland|little\s?drummer|first\s?noel|angels\s?we\s?have|hark\s?the|away\s?in\s?a\s?manger|feliz\s?navidad|all\s?i\s?want\s?for|bells?\s?rock|nutcracker|くるみ割り/gi }, // 冬とは別の一覧(クリスマスの曲は冬に入れない)
];
const seasonDefByListId = (id) => (typeof id === 'string' ? SEASONS.find(d => 'season:' + d.key === id) : undefined);
const isEditableListId = (id) => typeof id === 'number' || !!seasonDefByListId(id);
// 自動で決まる一覧(お気に入り・最近追加した曲など・季節)は、どれも同じしくみで名前を変えられる。名前は listLabels に、一覧のキーごとに保存する
const ALL_LIST_DEFS = () => [
  { key: 'fav', label: 'お気に入りの曲' },
  ...AUTO_LISTS.map(d => ({ key: 'auto:' + d.key, label: d.label })),
  ...ERA_LISTS.map(d => ({ key: 'era:' + d.key, label: d.label })),
  { key: 'seasonFolder', label: '季節の曲' },
  ...SEASONS.map(d => ({ key: 'season:' + d.key, label: d.label })),
];
// 保存されている名前(未設定なら既定の名前)。他の一覧の名前と見比べるためのもので、そのままでは使わない
function rawListLabel(entry) {
  const custom = (Settings.get('listLabels') || {})[entry.key];
  return (custom && custom.trim()) || entry.label;
}
// 実際に表示する名前。他の一覧と同じ名前になっていたら(旧版の保存データなど)、紛らわしいので既定の名前に戻す
function listLabel(key) {
  const entry = ALL_LIST_DEFS().find(e => e.key === key);
  if (!entry) return key;
  const val = rawListLabel(entry).normalize('NFKC');
  const clash = ALL_LIST_DEFS().some(o => o.key !== key && rawListLabel(o).normalize('NFKC') === val);
  return clash ? entry.label : rawListLabel(entry);
}
function seasonLabel(def) { return listLabel('season:' + def.key); }
function seasonOrderedTracks(def) {
  const list = tracks.filter(t => seasonOf(t) === def.key).sort((a, b) => sectionSort(trackSortKey(a), trackSortKey(b)));
  const order = (Settings.get('seasonOrders') || {})[def.key] || [];
  const byId = new Map(list.map(t => [t.id, t]));
  const first = order.map(id => byId.get(id)).filter(Boolean);
  const placed = new Set(first.map(t => t.id));
  return [...first, ...list.filter(t => !placed.has(t.id))];
}
// いま開いている(編集できる)一覧の曲id。自分のプレイリストなら保存された並び、季節なら上の並び
function editableIds() {
  const def = seasonDefByListId(currentPlaylistId);
  if (def) return seasonOrderedTracks(def).map(t => t.id);
  const pl = playlists.find(p => p.id === currentPlaylistId);
  return pl ? pl.trackIds.slice() : [];
}
async function saveEditableIds(ids) {
  const def = seasonDefByListId(currentPlaylistId);
  if (def) { Settings.set('seasonOrders', { ...(Settings.get('seasonOrders') || {}), [def.key]: ids }); return; }
  const pl = playlists.find(p => p.id === currentPlaylistId);
  if (!pl) return;
  pl.trackIds = ids;
  await DB.updatePlaylist(pl);
}

function countMatches(text, re) {
  const m = text.match(re);
  return m ? m.length : 0;
}
function autoSeason(track) {
  // 「秋桜(コスモス)」は春の「桜」に数えない。「青春」は季節の「春」ではないので数えない
  const head = `${track.title || ''} ${track.album || ''}`.normalize('NFKC').replace(/秋桜/g, '秋').replace(/青春/g, '');
  const scoreOf = (text) => SEASONS.map(d => ({ key: d.key, n: countMatches(text, d.re) })).sort((a, b) => b.n - a.n);
  let sc = scoreOf(head);
  const xm = sc.find(x => x.key === 'xmas');
  if (xm.n > 0) return 'xmas'; // 曲名にクリスマスの言葉があれば、他の季節の言葉(「冬」など)が入っていてもクリスマス
  if (sc[0].n > 0 && sc[0].n > sc[1].n) return sc[0].key;
  // 曲名で決まらないときは、歌詞に出てくる季節の言葉が多く、はっきり差がある場合だけ採用する
  if (sc[0].n === 0 && track.lyrics) {
    sc = scoreOf(track.lyrics.normalize('NFKC').replace(/秋桜/g, '秋').replace(/青春/g, ''));
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
  const options = [...SEASONS.map(d => seasonLabel(d)), 'どれでもない', '自動判定に戻す'];
  const idx = await showChoiceSheet(`${track.title} の季節`, options);
  if (idx < 0) return;
  if (idx < SEASONS.length) track.season = SEASONS[idx].key;
  else if (idx === SEASONS.length) track.season = 'none';
  else delete track.season;
  await DB.updateTrack(track);
  renderPlaylistList();
  if (isPlaylistDetailActive() && typeof currentPlaylistId === 'string') openPlaylistDetail(currentPlaylistId);
}

// 「季節の曲」フォルダの中: 春夏秋冬・クリスマスを、1つずつの行にして出す(ジャンルのアルバム一覧と同じ考え方)
function openSeasonFolder() {
  renderSeasonFolderList();
  showView('view-season-folder');
}
function renderSeasonFolderList() {
  const listEl = document.getElementById('season-folder-list');
  listEl.innerHTML = '';
  SEASONS.forEach((def) => {
    const list = tracks.filter(t => seasonOf(t) === def.key).sort((a, b) => sectionSort(trackSortKey(a), trackSortKey(b)));
    const li = document.createElement('li');
    li.className = 'playlist-item';
    const img = document.createElement('img');
    img.className = 'playlist-artwork';
    img.src = list.length ? getThumbUrl(list.find(t => t.artworkBlob) || list[0]) : 'icons/default-artwork.png';
    const meta = document.createElement('div');
    meta.className = 'track-meta';
    meta.innerHTML = `<div class="playlist-name">${esc(seasonLabel(def))}</div><div class="playlist-count">${list.length}曲(自動)</div>`;
    const more = document.createElement('button');
    more.className = 'track-menu-btn';
    more.textContent = '⋯';
    more.addEventListener('click', (e) => { e.stopPropagation(); openListActionSheet('season:' + def.key); });
    li.append(img, meta, more);
    li.addEventListener('click', () => openPlaylistDetail('season:' + def.key, 'view-season-folder'));
    listEl.appendChild(li);
    refreshPlainScrollbarIfActive();
  });
}

// ===== プレイリスト =====
// 春夏秋冬とプレイリストを、まとめて好きな順に並べられる。順番(キーの配列)は端末に保存する
const PLAYLIST_ORDER_KEY = 'playlistOrder';
let playlistEditMode = false;

function playlistItemKey(item) { return item.fav ? 'fav' : item.auto ? 'auto:' + item.auto.key : item.era ? 'era:' + item.era.key : item.seasonFolder ? 'seasonFolder' : 'pl:' + item.pl.id; }

function orderedPlaylistItems() {
  // 標準の並び: プレイリスト(作成が新しい順。旧版で並べ替えた順があればそれ) → 令和/平成アニソン → 春夏秋冬
  const defaults = [
    { fav: true },
    ...AUTO_LISTS.map(d => ({ auto: d })),
    ...playlists.slice().sort((a, b) => {
      const oa = a.order === undefined ? Infinity : a.order;
      const ob = b.order === undefined ? Infinity : b.order;
      if (oa !== ob) return oa === Infinity ? 1 : ob === Infinity ? -1 : oa - ob;
      return b.createdAt - a.createdAt;
    }).map(pl => ({ pl })),
    ...ERA_LISTS.map(d => ({ era: d })),
    { seasonFolder: true },
  ];
  let saved = [];
  try { saved = JSON.parse(localStorage.getItem(PLAYLIST_ORDER_KEY)) || []; } catch (e) { /* 保存できない環境では標準の並び */ }
  const byKey = new Map(defaults.map(it => [playlistItemKey(it), it]));
  const savedItems = [];
  saved.forEach((k) => { if (byKey.has(k)) { savedItems.push(byKey.get(k)); byKey.delete(k); } });
  // 並び替えた後に作ったプレイリストなど、順が決まっていないものは、いちばん上に出す
  const fresh = defaults.filter(it => byKey.has(playlistItemKey(it)));
  // 新しく増えた春夏秋冬の仲間(クリスマス)は、冬の直後に入れる。それ以外(新しいプレイリスト)は一番上
  const freshAuto = fresh.filter(it => it.auto); // 自動の一覧は、お気に入りの曲の直後に入れる
  const freshSeasonFolder = fresh.find(it => it.seasonFolder); // 季節の曲フォルダは、無ければ、令和/平成アニソンの直後に入れる
  const freshEra = fresh.filter(it => it.era); // 令和/平成アニソンは「季節の曲」フォルダの直前に入れる
  const top = fresh.filter(it => !it.auto && !it.seasonFolder && !it.era);
  const fi = savedItems.findIndex(it => it.fav);
  if (fi >= 0) savedItems.splice(fi + 1, 0, ...freshAuto);
  else top.push(...freshAuto);
  const si = savedItems.findIndex(it => it.seasonFolder);
  if (si >= 0) {
    savedItems.splice(si, 0, ...freshEra);
  } else {
    top.push(...freshEra);
    if (freshSeasonFolder) top.push(freshSeasonFolder); // 季節の曲フォルダも保存された並びに無いとき(初回起動など)は、ここで一緒に並べる
  }
  return [...top, ...savedItems];
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
    if (item.auto) {
      list = item.auto.get();
      name = listLabel('auto:' + item.auto.key);
      countText = `${list.length}曲(自動)`; // 自分で作ったプレイリストと同じ名前でも、見分けがつくように
      open = () => openPlaylistDetail('auto:' + item.auto.key);
    } else if (item.era) {
      list = item.era.get();
      name = listLabel('era:' + item.era.key);
      countText = `${list.length}曲(自動)`;
      open = () => openPlaylistDetail('era:' + item.era.key);
    } else if (item.fav) {
      list = favs;
      name = listLabel('fav');
      countText = `${list.length}曲`;
      open = () => openPlaylistDetail('fav');
    } else if (item.seasonFolder) {
      list = SEASONS.flatMap(d => bySeason.get(d.key) || []);
      name = listLabel('seasonFolder');
      countText = `${list.length}曲(自動)`;
      open = () => openSeasonFolder();
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
      // 誤タップで消さないよう、削除は「⋯」を押したメニューの中に置く(お気に入り・自動の一覧・季節は、名前の変更だけ)
      const more = document.createElement('button');
      more.className = 'track-menu-btn';
      more.textContent = '⋯';
      more.addEventListener('click', (e) => {
        e.stopPropagation();
        if (item.pl) openPlaylistActionSheet(item.pl);
        else openListActionSheet(playlistItemKey(item));
      });
      li.appendChild(more);
    }
    listEl.appendChild(li);
  });
  refreshPlainScrollbarIfActive();
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
  const byId = new Map(tracks.map(t => [t.id, t]));
  const listEl = document.getElementById('playlist-detail-list');
  listEl._v = null;
  listEl.innerHTML = editableIds().map(id => byId.get(id)).filter(Boolean).map(t =>
    `<li class="edit-row" data-track-id="${t.id}"><img class="track-artwork" decoding="async" src="${getThumbUrl(t)}" alt="">` +
    `<div class="track-meta"><div class="track-title">${esc(t.title)}</div><div class="track-artist">${esc(t.artist)}</div></div>` +
    `<div class="drag-handle">≡</div></li>`).join('');
  refreshPlainScrollbarIfActive();
}
// 並び順のプルダウン(タイトル順・アーティスト順 × 昇順・降順)。選ぶと、その順に並べ替えて保存する。ボタンではなくプルダウンにして、誤タップを防ぐ
async function sortPlaylistSongs(value) {
  if (!value || !isEditableListId(currentPlaylistId)) return;
  const [key, d] = value.split(':');
  const dir = d === 'desc' ? -1 : 1;
  const artistKey = (t) => t.artistSort || t.artist || '';
  const cmp = key === 'artist'
    ? (a, b) => sectionSort(artistKey(a), artistKey(b)) || sectionSort(trackSortKey(a), trackSortKey(b))
    : (a, b) => sectionSort(trackSortKey(a), trackSortKey(b));
  const ids = editableIds();
  const byId = new Map(tracks.map(t => [t.id, t]));
  const list = ids.map(id => byId.get(id)).filter(Boolean).sort((a, b) => dir * cmp(a, b));
  const missing = ids.filter(id => !byId.has(id));
  await saveEditableIds([...list.map(t => t.id), ...missing]);
  renderSongEditList();
}

function toggleSongEditMode() {
  const btn = document.getElementById('btn-playlist-reorder');
  songEditMode = !songEditMode;
  btn.textContent = songEditMode ? '完了' : '並び替え';
  document.getElementById('btn-playlist-add').classList.toggle('hidden', songEditMode);
  document.getElementById('song-sort-bar').classList.toggle('hidden', !songEditMode);
  if (songEditMode) { document.getElementById('song-sort-select').value = ''; renderSongEditList(); }
  else openPlaylistDetail(currentPlaylistId); // 通常の一覧(先頭の再生ボタン付き)に戻す
}

async function createPlaylistPrompt() {
  const name = dialogPrompt('プレイリスト名を入力してください');
  if (!name || !name.trim()) return;
  if (reservedListName(name)) { dialogAlert(`「${name.trim()}」は、自動の一覧と同じ名前です。別の名前にしてください`); return; }
  const playlist = { name: name.trim(), trackIds: [], createdAt: Date.now() };
  const id = await DB.addPlaylist(playlist);
  playlist.id = id;
  playlists.push(playlist);
  renderPlaylistList();
}

let playlistDetailBackView = 'view-playlists'; // 「戻る」の行き先。季節の曲フォルダから開いたときは、そちらへ戻す
function openPlaylistDetail(playlistId, backView) {
  currentPlaylistId = playlistId;
  playlistDetailBackView = backView || 'view-playlists';
  const isSeason = typeof playlistId === 'string';
  let pl;
  let plTracks;
  const autoDef = AUTO_LISTS.find(d => 'auto:' + d.key === playlistId);
  const eraDef = ERA_LISTS.find(d => 'era:' + d.key === playlistId);
  if (autoDef) {
    pl = { name: autoDef.label };
    plTracks = autoDef.get(); // 新しい順・回数の多い順のまま出す
  } else if (eraDef) {
    pl = { name: listLabel('era:' + eraDef.key) };
    plTracks = eraDef.get().slice().sort((a, b) => sectionSort(trackSortKey(a), trackSortKey(b)));
  } else if (playlistId === 'fav') {
    pl = { name: 'お気に入りの曲' };
    plTracks = tracks.filter(t => t.favorite).sort((a, b) => sectionSort(trackSortKey(a), trackSortKey(b)));
  } else if (isSeason) {
    const def = SEASONS.find(d => 'season:' + d.key === playlistId);
    pl = { name: seasonLabel(def) };
    plTracks = seasonOrderedTracks(def);
  } else {
    pl = playlists.find(p => p.id === playlistId);
    if (!pl) return;
    plTracks = pl.trackIds.map(id => tracks.find(t => t.id === id)).filter(Boolean);
  }
  document.getElementById('playlist-detail-title').textContent = pl.name;
  document.getElementById('btn-playlist-add').classList.toggle('hidden', !isEditableListId(playlistId)); // 曲を足せるのは、自分のプレイリストと季節の一覧
  document.getElementById('btn-playlist-reorder').classList.toggle('hidden', !isEditableListId(playlistId));
  if (songEditMode) { songEditMode = false; document.getElementById('btn-playlist-reorder').textContent = '並び替え'; document.getElementById('song-sort-bar').classList.add('hidden'); } // 別のプレイリストを開いたら、並び替えは終わり
  const listEl = document.getElementById('playlist-detail-list');
  fillTrackList(listEl, plTracks, plTracks.map(t => t.id));
  showView('view-playlist-detail');
}

// ===== プレイリストに曲を追加する画面(Apple Musicと同じく、検索して「＋」を押していく) =====
let addSongsPlaylist = null; // 追加先。自分のプレイリスト、または { season: 季節の定義 }
const inAddTarget = (track) => !!addSongsPlaylist && (addSongsPlaylist.season ? seasonOf(track) === addSongsPlaylist.season.key : addSongsPlaylist.trackIds.includes(track.id));

function addRowHTML(track) {
  const on = inAddTarget(track);
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
  listEl._v = null;
  renderVirtualList(listEl, buildSectionedRows(list), makeSectionedRowFn(addRowHTML), sectionedRowHeight);
}

function openAddSongs() {
  const def = seasonDefByListId(currentPlaylistId);
  const pl = def ? { season: def } : playlists.find(p => p.id === currentPlaylistId);
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
  const on = !inAddTarget(t);
  if (pl.season) {
    t.season = on ? pl.season.key : 'none'; // 追加 = この季節に決める / 外す = どれでもない
  } else if (on) pl.trackIds.push(t.id);
  else pl.trackIds.splice(pl.trackIds.indexOf(t.id), 1);
  document.querySelectorAll(`.add-row[data-track-id="${t.id}"] .add-btn`).forEach((b) => {
    b.classList.toggle('on', on);
    b.textContent = on ? '✓' : '＋';
  });
  if (pl.season) await DB.updateTrack(t); else await DB.updatePlaylist(pl);
}

function closeAddSongs() {
  addSongsPlaylist = null;
  renderPlaylistList();
  openPlaylistDetail(currentPlaylistId); // 追加した曲が並んだ状態で、プレイリストに戻る
}

// お気に入り・自動の一覧・季節、共通の「名前を変更」。exceptKey 以外の全ての一覧と同じ名前にはできない
async function openListActionSheet(key) {
  const entry = ALL_LIST_DEFS().find(e => e.key === key);
  if (!entry) return;
  const custom = (Settings.get('listLabels') || {})[key];
  const options = custom ? ['名前を変更', `名前を元に戻す(${entry.label})`] : ['名前を変更'];
  const idx = await showChoiceSheet(listLabel(key), options);
  if (idx < 0) return;
  const labels = { ...(Settings.get('listLabels') || {}) };
  if (idx === 0) {
    const name = dialogPrompt('新しい名前', listLabel(key));
    if (name === null || !name.trim()) return;
    if (reservedListName(name, key)) { dialogAlert(`「${name.trim()}」は、ほかの一覧と同じ名前です。別の名前にしてください`); return; }
    labels[key] = name.trim();
  } else {
    delete labels[key];
  }
  Settings.set('listLabels', labels);
  renderPlaylistList();
  if (document.getElementById('view-season-folder').classList.contains('active')) renderSeasonFolderList();
}

// 自動で決まる一覧(お気に入り・最近追加した曲・季節など)と同じ名前は、見分けがつかなくなるので、付けさせない
function reservedListName(name, exceptKey) {
  const n = name.normalize('NFKC').trim();
  const names = ALL_LIST_DEFS().filter(e => e.key !== exceptKey).map(e => listLabel(e.key));
  return names.some(x => x.normalize('NFKC') === n);
}

async function renamePlaylist(pl) {
  const name = dialogPrompt('プレイリストの新しい名前', pl.name);
  if (name === null || !name.trim() || name.trim() === pl.name) return;
  if (reservedListName(name)) { dialogAlert(`「${name.trim()}」は、自動の一覧と同じ名前です。別の名前にしてください`); return; }
  pl.name = name.trim();
  await DB.updatePlaylist(pl);
  renderPlaylistList();
}

async function openPlaylistActionSheet(pl) {
  const idx = await showChoiceSheet(pl.name, ['名前を変更', 'プレイリストを削除']);
  if (idx === 0) { renamePlaylist(pl); return; }
  if (idx !== 1) return;
  if (!dialogConfirm(`プレイリスト「${pl.name}」を削除しますか?(曲自体はライブラリに残ります)`)) return;
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
    const name = dialogPrompt('プレイリストがありません。新規作成しますか?名前を入力してください');
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
  const def = seasonDefByListId(currentPlaylistId);
  if (def) {
    const t = tracks.find(x => x.id === trackId);
    if (!t) return;
    t.season = 'none'; // この季節から外す = どれでもない
    await DB.updateTrack(t);
    openPlaylistDetail(currentPlaylistId);
    renderPlaylistList();
    return;
  }
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

let playCounted = false; // 今の再生を、再生回数に数えたか
let wantsToPlay = false; // 最後に自分で選んだ意図が「再生」か「一時停止」か(電話などで強制的に止められたのと、自分で止めたのを見分けるため)
let jointDisabled = false;  // 2つめの要素で再生できなかった端末では、その起動中は重ねを使わない
let jointBusy = false;      // 曲の重ね(クロスフェード/ギャップレス)の最中
let jointOldEl = null;      // 重ねの最中に、消えていく方の要素
let jointStartTimer = null; // ギャップレス: 曲の終わりの直前に、次の曲を始める予約
let jointEndTimer = null;   // 重ねが終わったら、前の曲を止める予約
let preloaded = { el: null, trackId: null }; // 次の曲を先に読み込んでおいた要素と曲

// 「音量の自動そろえ」がオンで、音量を調整済みのファイルができていれば、そちらを再生する(元のファイルはそのまま)
function playbackBlob(track) {
  if (Settings.get('soundCheck') && track.normBlob && track.normGainDb === (track.gainDb || 0)) return track.normBlob;
  return track.fileBlob;
}
function setSource(el, track) {
  const old = audioUrls.get(el);
  if (old) URL.revokeObjectURL(old);
  const url = URL.createObjectURL(playbackBlob(track));
  audioUrls.set(el, url);
  el.src = url;
  el.playbackRate = playbackSpeed;
  if (preloaded.el === el) preloaded = { el: null, trackId: null };
}

// index を渡すと、再生待ちの中のその位置として扱う(同じ曲が2つあっても取り違えない)
// opts.joint: 曲の重ね。opts.el の要素で新しい曲を始め、今の曲を opts.fadeSec 秒かけて消す
function loadAndPlay(track, index, opts = {}) {
  const prev = { track: currentTrack, index: currentIndex };
  currentTrack = track;
  playCounted = false;
  wantsToPlay = true;
  currentIndex = index !== undefined ? index : currentQueue.indexOf(track.id);
  if (!opts.joint) cancelJoint();
  const el = opts.joint ? opts.el : audioEl;
  if (!(preloaded.el === el && preloaded.trackId === track.id)) setSource(el, track);
  else preloaded = { el: null, trackId: null };
  prepareAudioEngine();
  ensureNormalized(track);
  if (opts.joint) {
    const oldEl = audioEl;
    audioEl = el;
    const fadeSec = opts.fadeSec || 0;
    fadeVolume(el, true, fadeSec);
    if (fadeSec > 0) fadeVolume(oldEl, false, fadeSec);
    jointEndTimer = setTimeout(() => {
      oldEl.pause();
      setVolumeImmediate(oldEl, 1);
      if (jointOldEl === oldEl) jointOldEl = null;
      jointBusy = false;
      jointEndTimer = null;
    }, (fadeSec + 0.2) * 1000);
  } else {
    setVolumeImmediate(el, 1);
  }
  const started = el.play();
  if (opts.joint && started && started.catch) started.catch(() => abortJoint(el, prev));
  else if (started && started.catch) started.catch(() => {});
  updateNowPlayingUI();
  if (opts.joint && isFinite(el.duration)) document.getElementById('np-duration').textContent = formatTime(el.duration);
  updateMediaSession();
  showMiniPlayer();
  refreshPlayingHighlight();
  renderQueueIfOpen();
  savePlaybackState(true);
}

// ===== 音声の特別な処理(設定): 音量の自動そろえ / ギャップレス / クロスフェード =====
const SILENT_WAV_BYTES = (() => { // 0.1秒の無音(2つめの要素を、最初の操作のときに「使ってよい」状態にするため)
  const n = 800, buf = new Uint8Array(44 + n);
  const w = (o, str) => { for (let i = 0; i < str.length; i++) buf[o + i] = str.charCodeAt(i); };
  const u32 = (o, v) => { buf[o] = v & 255; buf[o + 1] = (v >> 8) & 255; buf[o + 2] = (v >> 16) & 255; buf[o + 3] = (v >> 24) & 255; };
  w(0, 'RIFF'); u32(4, 36 + n); w(8, 'WAVEfmt '); u32(16, 16); buf[20] = 1; buf[22] = 1; u32(24, 8000); u32(28, 8000); buf[32] = 1; buf[34] = 8; w(36, 'data'); u32(40, n);
  buf.fill(128, 44);
  return buf;
})();
let secondUnlocked = false;
function unlockSecondElement() {
  if (secondUnlocked) return;
  secondUnlocked = true;
  const el = audioEl === audioA ? audioB : audioA;
  if (el.src) return;
  el.src = URL.createObjectURL(new Blob([SILENT_WAV_BYTES], { type: 'audio/wav' }));
  const pr = el.play();
  if (pr && pr.then) pr.then(() => el.pause()).catch(() => {});
}

function prepareAudioEngine() {
  if (Settings.get('joint') !== 'off') unlockSecondElement();
}

// 電話などで強制的に止められたときの再開。1回失敗しても、少し待って何回か試す
// (iOSは、電話が終わった直後などは一瞬再生を拒否することがあるため)
let resumeRetryTimer = null;
// hard=true: 読み込み元(blobのURL)を作り直してから再生する。
// iOSは、割り込み(電話・ロック画面)のあとに頼むと、見た目は「再生中」になるのに実際は無音のことがあるため、
// 電話・ロック画面からの再開(＝割り込みから戻ってきたとき)は、最初からこちらを使う
function attemptResume(tries = 5, hard = false) {
  clearTimeout(resumeRetryTimer);
  resumeRetryTimer = null;
  if (!wantsToPlay || !currentTrack || !audioEl.paused) return;
  prepareAudioEngine();
  const track = currentTrack;
  const el = audioEl;
  if (hard) {
    if ('audioSession' in navigator) { try { navigator.audioSession.type = 'playback'; } catch (e) { /* 無視 */ } }
    const savedTime = el.currentTime;
    setSource(el, track); // blobのURLを作り直す(古い参照のまま再生を頼んでも無音になることがあるため)
    el.currentTime = savedTime;
  }
  // 曲の重ね(クロスフェード)の途中で一時停止すると、音量が下がった/上がりきっていない途中の値のまま
  // 止まることがある。そのまま再開すると「再生はされるが音がほぼ聞こえない」状態になるため、必ず戻す
  if (!jointBusy) setVolumeImmediate(el, 1);
  el.play().then(() => {
    resumeRetryTimer = null;
    if (!wantsToPlay) { el.pause(); return; } // 再開できた頃には、やっぱり止めたくなっていた場合
    verifyProgressing(track, el, el.currentTime, tries);
  }).catch(() => {
    if (tries > 1) resumeRetryTimer = setTimeout(() => attemptResume(tries - 1, true), 500);
  });
}

// iOSは「再生中」と返ってきても、実際には音が出ない(時刻が進まない)ことがある。
// 少し待って本当に進んでいるか確認し、進んでいなければ音声の読み込み元を作り直して再試行する
function verifyProgressing(track, el, startTime, tries) {
  if (tries <= 1) return; // やり尽くした
  setTimeout(() => {
    if (currentTrack !== track || audioEl !== el || !wantsToPlay || el.paused) return; // 状況が変わっていれば何もしない
    if (el.currentTime - startTime > 0.1) return; // ちゃんと進んでいる
    const savedTime = el.currentTime;
    setSource(el, track); // blobのURLを作り直す(古い参照が無効になっている場合の対策)
    el.currentTime = savedTime;
    el.play().then(() => verifyProgressing(track, el, el.currentTime, tries - 1)).catch(() => {
      if (tries > 2) resumeRetryTimer = setTimeout(() => attemptResume(tries - 2, true), 500);
    });
  }, 1200);
}

// ---- フェード(クロスフェード): AudioContextを使わず、<audio>のvolumeを直接動かす ----
// (AudioContext経由にすると、ロック画面でiOSに止められて無音になるため)
const fadeRaf = new Map(); // audio要素 → 実行中のrequestAnimationFrame id
function cancelFade(el) {
  if (fadeRaf.has(el)) { cancelAnimationFrame(fadeRaf.get(el)); fadeRaf.delete(el); }
}
function setVolumeImmediate(el, value) { cancelFade(el); el.volume = value; }
function fadeVolume(el, up, sec) {
  cancelFade(el);
  if (sec <= 0.001) { el.volume = up ? 1 : 0; return; }
  const from = up ? 0 : 1;
  const to = up ? 1 : 0;
  el.volume = from;
  const start = performance.now();
  const dur = sec * 1000;
  const step = (now) => {
    const t = Math.min(1, (now - start) / dur);
    const curve = up ? Math.sin(t * Math.PI / 2) : Math.cos(t * Math.PI / 2); // 等パワーカーブ
    el.volume = Math.max(0, Math.min(1, from + (to - from) * curve)); // 浮動小数の誤差で0〜1を超えないように

    if (t < 1) fadeRaf.set(el, requestAnimationFrame(step));
    else fadeRaf.delete(el);
  };
  fadeRaf.set(el, requestAnimationFrame(step));
}

// ---- 音量の自動そろえ: 波形を加工した音声ファイルを、曲ごとに1回だけ作って保存する ----
const normalizingInFlight = new Map(); // 曲のid → 作成中のPromise
function renderNormalizedForTrack(track) {
  if (normalizingInFlight.has(track.id)) return normalizingInFlight.get(track.id);
  const pr = (async () => {
    try {
      const gainDb = track.gainDb || 0;
      // ほぼ差が無い曲は、わざわざ作り直さず元のファイルのまま鳴らす
      track.normBlob = Math.abs(gainDb) >= 0.5 ? await AudioEngine.renderNormalized(track.fileBlob, gainDb) : null;
      track.normGainDb = gainDb;
      await DB.updateTrack(track);
    } catch (err) {
      console.error('音量を調整したファイルの作成に失敗:', track.title, err);
      track.normGainDb = track.gainDb; // 今回の起動中は、同じ曲を何度も試さない(保存はしない)
    } finally {
      normalizingInFlight.delete(track.id);
    }
  })();
  normalizingInFlight.set(track.id, pr);
  return pr;
}
// 再生を始めるとき・設定を変えたときに呼ぶ。今の再生には間に合わなくても、次に鳴らすときのために作っておく
function ensureNormalized(track) {
  if (!Settings.get('soundCheck')) return;
  if (typeof track.gainDb !== 'number') { analyzeTrackLoudness(track).then(() => ensureNormalized(track)); return; }
  if (track.normGainDb === track.gainDb) return;
  renderNormalizedForTrack(track);
}

const loudnessInFlight = new Map(); // 曲のid → 解析中のPromise
function analyzeTrackLoudness(track) {
  if (loudnessInFlight.has(track.id)) return loudnessInFlight.get(track.id);
  const pr = (async () => {
    try {
      const r = await AudioEngine.analyze(track.fileBlob);
      track.gainDb = r.gainDb;
      await DB.updateTrack(track);
    } catch (err) {
      console.error('音量の解析に失敗:', track.title, err);
      track.gainDb = 0; // 今回の起動中は、同じ曲を何度も試さない(保存はしない)
    } finally {
      loudnessInFlight.delete(track.id);
    }
  })();
  loudnessInFlight.set(track.id, pr);
  return pr;
}

let analyzingAll = false;
const normalizeDone = (t) => typeof t.gainDb === 'number' && t.normGainDb === t.gainDb;
function updateLoudnessStatus() {
  const el = document.getElementById('loudness-status');
  if (!el || analyzingAll) return;
  const done = tracks.filter(normalizeDone).length;
  el.textContent = `処理済み ${done} / ${tracks.length}曲`;
}
async function analyzeAllLoudness() {
  if (analyzingAll) return;
  const targets = tracks.filter(t => !normalizeDone(t));
  if (targets.length === 0) { dialogAlert('すべての曲の処理が済んでいます'); return; }
  if (!dialogConfirm(`${targets.length}曲の音量を解析・調整します。曲数によっては数分〜数十分かかります。アプリを開いたまま待つ必要があります。始めますか?`)) return;
  analyzingAll = true;
  const btn = document.getElementById('btn-analyze-loudness');
  const status = document.getElementById('loudness-status');
  btn.disabled = true;
  for (let i = 0; i < targets.length; i++) {
    status.textContent = `処理中... ${i + 1} / ${targets.length}曲`;
    const t = targets[i];
    if (typeof t.gainDb !== 'number') await analyzeTrackLoudness(t);
    if (t.normGainDb !== t.gainDb) await renderNormalizedForTrack(t);
  }
  analyzingAll = false;
  btn.disabled = false;
  updateLoudnessStatus();
}

// 設定が変わったとき。特別な処理が要る設定なら、ここ(画面を触った直後)で準備する
function onAudioSettingsChanged() {
  if (Settings.get('joint') !== 'off') unlockSecondElement();
  else cancelJoint();
  if (currentTrack) ensureNormalized(currentTrack);
}

// ---- 曲の重ね ----
function nextQueueIndex() {
  if (currentQueue.length === 0) return -1;
  let n = currentIndex + 1;
  if (n >= currentQueue.length) {
    if (repeatMode === 'all') n = 0;
    else return -1;
  }
  return n;
}
const otherElement = () => (audioEl === audioA ? audioB : audioA);

// 次の曲を、2つめの要素で鳴らせなかったとき(iPhoneなどで、画面を触らずに始められない場合)。元の曲に戻して、今までどおりの切り替えにする
function abortJoint(newEl, prev) {
  const oldEl = jointOldEl || otherElementOf(newEl);
  if (audioEl !== newEl) return; // すでに別の操作で切り替わっていれば、何もしない
  jointDisabled = true;
  clearTimeout(jointEndTimer); jointEndTimer = null;
  jointOldEl = null;
  jointBusy = false;
  newEl.pause();
  setVolumeImmediate(oldEl, 1);
  audioEl = oldEl;
  currentTrack = prev.track;
  currentIndex = prev.index;
  updateNowPlayingUI();
  updateMediaSession();
  refreshPlayingHighlight();
  renderQueueIfOpen();
  showToast('この端末では、曲の重ねを使えませんでした。通常の切り替えにします');
  const ended = oldEl.ended || (isFinite(oldEl.duration) && oldEl.currentTime >= oldEl.duration - 0.05);
  if (ended) playNext(); // 前の曲が、すでに終わっていたら、そのまま次の曲へ
  else if (oldEl.paused) oldEl.play().catch(() => {});
}
const otherElementOf = (el) => (el === audioA ? audioB : audioA);

function cancelJoint() {
  clearTimeout(jointStartTimer); jointStartTimer = null;
  clearTimeout(jointEndTimer); jointEndTimer = null;
  if (jointOldEl) { jointOldEl.pause(); setVolumeImmediate(jointOldEl, 1); jointOldEl = null; }
  jointBusy = false;
}
function clearJointStartTimer() { clearTimeout(jointStartTimer); jointStartTimer = null; }

function preloadNext() {
  if (jointBusy) return;
  const ni = nextQueueIndex();
  if (ni < 0) return;
  const tr = tracks.find(t => t.id === currentQueue[ni]);
  const el = otherElement();
  if (!tr || (preloaded.el === el && preloaded.trackId === tr.id)) return;
  setSource(el, tr);
  el.load();
  preloaded = { el, trackId: tr.id };
}

function startJoint(fadeSec) {
  if (jointBusy) return;
  const ni = nextQueueIndex();
  if (ni < 0) return;
  const tr = tracks.find(t => t.id === currentQueue[ni]);
  if (!tr) return;
  jointBusy = true;
  jointOldEl = audioEl;
  loadAndPlay(tr, ni, { joint: true, el: otherElement(), fadeSec });
}

// 再生中の曲の残りが少なくなったら、次の曲を先に読み込み、重ねる(timeupdate から、約0.25秒ごとに呼ぶ)
function checkJoint() {
  const mode = Settings.get('joint');
  if (mode === 'off' || jointDisabled || jointBusy || audioEl.paused || repeatMode === 'one') return;
  const d = audioEl.duration;
  if (!d || !isFinite(d)) return;
  const remaining = d - audioEl.currentTime;
  if (remaining < 20) preloadNext();
  if (mode === 'crossfade') {
    const fade = Math.min(Settings.get('crossfadeSec'), d / 2);
    if (remaining <= fade) startJoint(Math.max(0.05, remaining));
  } else if (remaining <= 1.2 && jointStartTimer === null) {
    // ギャップレス: 曲の終わりの直前に、次の曲を始める(終わってから始めると、間があいてしまう)
    jointStartTimer = setTimeout(() => {
      jointStartTimer = null;
      if (!audioEl.paused && audioEl.duration - audioEl.currentTime < 0.4) startJoint(0);
    }, Math.max(0, (remaining - 0.04) * 1000));
  }
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
  if (audioEl.paused) {
    wantsToPlay = true;
    attemptResume();
  } else {
    wantsToPlay = false;
    cancelJoint(); // 曲の重ね(クロスフェード)の途中で止めても、消えていく方を含めてきちんと止める
    setVolumeImmediate(audioEl, 1); // フェードの途中の音量のまま、次に再開しないように
    audioEl.pause();
  }
}

function playNext() {
  if (currentQueue.length === 0) return;
  let nextIndex = nextQueueIndex();
  for (let guard = 0; nextIndex >= 0 && guard < currentQueue.length; guard++) {
    const track = tracks.find(t => t.id === currentQueue[nextIndex]);
    if (track) { loadAndPlay(track, nextIndex); return; }
    currentIndex = nextIndex; // ライブラリに無い曲(削除済み)は飛ばす
    nextIndex = nextQueueIndex();
  }
  audioEl.pause();
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
  if (track) loadAndPlay(track, prevIndex);
}

// ===== 重複した曲をまとめる =====
// 同じ曲を二重に取り込んでしまった場合(コピーし直したファイルは更新日時が変わり、別の曲として入る)を探して、1つにまとめる
function normalizeForDup(str) { return String(str || '').normalize('NFKC').toLowerCase().replace(/\s+/g, ''); }

function findDuplicateGroups() {
  const parent = new Map(tracks.map(t => [t.id, t.id]));
  const find = (x) => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
  const union = (a, b) => { parent.set(find(a), find(b)); };
  // 1) ファイルの名前と大きさが同じ  2) 曲名とアーティストが同じで、長さが1.5秒以内
  const byBase = new Map();
  const byTitle = new Map();
  tracks.forEach((t) => {
    if (t.sourceKey) {
      const k = sourceKeyBase(t.sourceKey);
      if (byBase.has(k)) union(byBase.get(k), t.id); else byBase.set(k, t.id);
    }
    const tk = `${normalizeForDup(t.title)}|${normalizeForDup(t.artist)}`;
    if (!byTitle.has(tk)) byTitle.set(tk, []);
    byTitle.get(tk).push(t);
  });
  byTitle.forEach((list) => {
    for (let i = 1; i < list.length; i++) {
      for (let j = 0; j < i; j++) {
        if (Math.abs((list[i].duration || 0) - (list[j].duration || 0)) <= 1.5 && (list[i].duration || list[j].duration)) { union(list[i].id, list[j].id); break; }
      }
    }
  });
  const groups = new Map();
  tracks.forEach((t) => { const r = find(t.id); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(t); });
  return [...groups.values()].filter(g => g.length > 1);
}

async function mergeDuplicates() {
  const groups = findDuplicateGroups();
  if (groups.length === 0) { dialogAlert('重複した曲は見つかりませんでした'); return; }
  const removeCount = groups.reduce((n, g) => n + g.length - 1, 0);
  const sample = groups.slice(0, 5).map(g => `・${g[0].title}(${g.length}つ)`).join('\n');
  if (!dialogConfirm(`同じ曲が重複しているものが、${groups.length}組(削除される曲: ${removeCount}曲)見つかりました。\n${sample}${groups.length > 5 ? '\n…' : ''}\n\n1つにまとめます。お気に入り・プレイリスト・再生回数・歌詞は、残す曲に引き継ぎます。よろしいですか?`)) return;

  const usage = new Map(); // 曲id → プレイリストに入っている数
  playlists.forEach(pl => pl.trackIds.forEach(id => usage.set(id, (usage.get(id) || 0) + 1)));
  const score = (t) => (t.favorite ? 4 : 0) + (usage.get(t.id) || 0) * 3 + (t.playCount ? 2 : 0) + (t.lyrics ? 1 : 0) + (t.artworkBlob ? 1 : 0);
  const idMap = new Map(); // 消す曲のid → 残す曲のid
  for (const g of groups) {
    const keep = g.slice().sort((a, b) => score(b) - score(a) || (a.addedAt || 0) - (b.addedAt || 0))[0];
    for (const t of g) {
      if (t === keep) continue;
      idMap.set(t.id, keep.id);
      if (t.favorite) keep.favorite = true;
      keep.playCount = (keep.playCount || 0) + (t.playCount || 0);
      keep.lastPlayedAt = Math.max(keep.lastPlayedAt || 0, t.lastPlayedAt || 0) || undefined;
      if (!keep.season && t.season) keep.season = t.season;
      if (!keep.lyrics && t.lyrics) { keep.lyrics = t.lyrics; keep.syncedLyrics = t.syncedLyrics; keep.lyricOffset = t.lyricOffset; }
      if (!keep.artworkBlob && t.artworkBlob) keep.artworkBlob = t.artworkBlob;
    }
    await DB.updateTrack(keep);
  }
  for (const pl of playlists) { // プレイリストの中の、消す曲を、残す曲に置き換える(同じ曲が2回並ばないように)
    const ids = [];
    pl.trackIds.forEach((id) => { const nid = idMap.has(id) ? idMap.get(id) : id; if (!ids.includes(nid)) ids.push(nid); });
    if (ids.length !== pl.trackIds.length || ids.some((id, i) => id !== pl.trackIds[i])) { pl.trackIds = ids; await DB.updatePlaylist(pl); }
  }
  const orders = Settings.get('seasonOrders');
  if (orders) {
    const fixed = {};
    Object.entries(orders).forEach(([k, ids]) => { fixed[k] = [...new Set(ids.map(id => (idMap.has(id) ? idMap.get(id) : id)))]; });
    Settings.set('seasonOrders', fixed);
  }
  for (const oldId of idMap.keys()) {
    await DB.deleteTrack(oldId);
    await DB.deleteThumb(oldId);
    thumbMap.delete(oldId);
    thumbUrlCache.delete(oldId);
    removeFromQueues(oldId);
  }
  tracks = tracks.filter(t => !idMap.has(t.id));
  markLibraryChanged();
  renderTrackList(document.getElementById('search-input').value.trim());
  renderPlaylistList();
  updateLoudnessStatus();
  dialogAlert(`${removeCount}曲の重複をまとめました`);
}

// ===== 診断情報(不具合の原因を調べるために、画面の状態をそのまま表示する) =====
async function showDiagnostics() {
  const out = [];
  out.push(`バージョン: ${APP_VERSION}`);
  out.push(`曲: ${tracks.length}曲 / プレイリスト: ${playlists.length}件`);
  const pl = await DB.getAllPlaylists();
  out.push('--- プレイリスト(保存されているもの) ---');
  pl.forEach(p => out.push(`  id=${p.id} 「${p.name}」 ${p.trackIds.length}曲`));
  out.push('--- 一覧の並び(端末に保存) ---');
  out.push('  ' + (localStorage.getItem(PLAYLIST_ORDER_KEY) || '(なし)'));
  out.push('--- 一覧の名前(変更したもの) ---');
  out.push('  ' + JSON.stringify(Settings.get('listLabels') || {}));
  out.push('--- 今のプレイリスト画面の行 ---');
  const wasActive = document.getElementById('view-playlists').classList.contains('active');
  document.querySelectorAll('#playlist-list li').forEach((li, i) => {
    const name = li.querySelector('.playlist-name');
    const count = li.querySelector('.playlist-count');
    out.push(`  ${i + 1}. [${li.dataset.key}] ${name ? name.textContent : ''} / ${count ? count.textContent : ''}${li.querySelector('.track-menu-btn') ? ' / ⋯あり' : ''}`);
  });
  if (!wasActive) out.push('  (プレイリスト画面を開いていないため、表示は古い可能性があります)');
  out.push('--- 予定される行(プログラム上の一覧) ---');
  orderedPlaylistItems().forEach((it, i) => out.push(`  ${i + 1}. [${playlistItemKey(it)}]`));
  out.push(`playlist-list の数: ${document.querySelectorAll('#playlist-list').length}`);
  document.getElementById('diag-output').textContent = out.join('\n');
}

// ===== 設定画面 =====
let settingsUIRefresh = null;
function bindSettings() {
  const $ = (id) => document.getElementById(id);
  const themeSel = $('set-theme'), jointSel = $('set-joint'), secSel = $('set-crossfade-sec'), scBox = $('set-soundcheck');
  themeSel.value = Settings.get('theme');
  jointSel.value = Settings.get('joint');
  secSel.value = String(Settings.get('crossfadeSec'));
  scBox.checked = !!Settings.get('soundCheck');
  const syncRows = () => $('row-crossfade-sec').classList.toggle('hidden', jointSel.value !== 'crossfade');
  syncRows();
  settingsUIRefresh = () => { jointSel.value = Settings.get('joint'); scBox.checked = !!Settings.get('soundCheck'); syncRows(); };
  $('settings-version').textContent = `バージョン ${APP_VERSION}`;
  let backTo = 'view-library';
  $('btn-settings').addEventListener('click', () => { const a = document.querySelector('.view.active'); backTo = a ? a.id : 'view-library'; updateLoudnessStatus(); showView('view-settings'); });
  $('btn-back-settings').addEventListener('click', () => showView(backTo));
  themeSel.addEventListener('change', () => Settings.set('theme', themeSel.value));
  jointSel.addEventListener('change', () => { Settings.set('joint', jointSel.value); syncRows(); onAudioSettingsChanged(); });
  secSel.addEventListener('change', () => { Settings.set('crossfadeSec', Number(secSel.value)); onAudioSettingsChanged(); });
  scBox.addEventListener('change', () => { Settings.set('soundCheck', scBox.checked); onAudioSettingsChanged(); });
  $('btn-analyze-loudness').addEventListener('click', analyzeAllLoudness);
  $('btn-merge-duplicates').addEventListener('click', mergeDuplicates);
  $('btn-diagnostics').addEventListener('click', showDiagnostics);
  $('btn-backup-export').addEventListener('click', async () => {
    try {
      const r = await Backup.exportFile();
      if (r.ok) showToast(`書き出しました(プレイリスト${r.playlists}件・曲${r.tracks}曲分)`);
    } catch (err) {
      console.error('バックアップの書き出しに失敗:', err);
      dialogAlert('書き出しに失敗しました');
    }
  });
  const fileInput = $('backup-file-input');
  $('btn-backup-import').addEventListener('click', () => { fileInput.value = ''; fileInput.click(); });
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;
    try {
      const data = Backup.parse(await file.text());
      if (!dialogConfirm(`バックアップ(${(data.exportedAt || '').slice(0, 10)})から復元します。\n・プレイリスト${data.playlists.length}件(今のプレイリストは、この内容に置き換わります)\n・曲の情報${data.tracks.length}曲分(お気に入り・編集・歌詞など)\n・設定\n曲のファイルは変わりません。よろしいですか?`)) return;
      const r = await Backup.restore(data);
      dialogAlert(`復元しました。曲の情報は、${r.total}曲中${r.matched}曲が見つかり、反映しました。アプリを再読み込みします`);
      location.reload();
    } catch (err) {
      dialogAlert(err.message || '復元に失敗しました');
    }
  });
  $('btn-check-update').addEventListener('click', checkForUpdate);
}

// サーバー上の最新のjs/version.jsを(キャッシュを通さず)取りに行き、今動いているバージョンと比べる
async function fetchLatestVersion() {
  const res = await fetch(`js/version.js?t=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error('取得できませんでした');
  const text = await res.text();
  const m = text.match(/APP_VERSION\s*=\s*['"]([^'"]+)['"]/);
  if (!m) throw new Error('バージョンを読み取れませんでした');
  return m[1];
}

// service-worker.js自体は中身(バイト列)が変わらないリリースもあるため、
// ブラウザの自動更新チェックだけでは新しさに気づけない場合がある。
// そのため、新しいバージョンがあると分かったら unregister→再登録して、確実に新しい内容を取りに行かせる
async function applyServiceWorkerUpdate() {
  if (!('serviceWorker' in navigator)) return;
  const reg = await navigator.serviceWorker.getRegistration();
  if (reg) await reg.unregister().catch(() => {});
  await navigator.serviceWorker.register('service-worker.js').catch(() => {});
}

let autoUpdateNoticeShown = false;
let autoUpdateCheckInFlight = false;
// アプリを開いた・前面に戻ったときに、裏で静かにバージョンを確認する(ユーザーが設定画面を開く必要がないようにするため)
async function autoCheckUpdateSilently() {
  if (autoUpdateCheckInFlight || autoUpdateNoticeShown) return;
  autoUpdateCheckInFlight = true;
  try {
    const latest = await fetchLatestVersion();
    if (latest !== APP_VERSION) {
      autoUpdateNoticeShown = true;
      await applyServiceWorkerUpdate();
      showToast(`新しいバージョン(${latest})があります。アプリを閉じて開き直すと反映されます`);
    }
  } catch (err) { /* オフラインなどはここでは何もしない(設定画面のボタンでエラーを伝える) */ }
  finally { autoUpdateCheckInFlight = false; }
}

async function checkForUpdate() {
  const statusEl = document.getElementById('update-status');
  const btn = document.getElementById('btn-check-update');
  btn.disabled = true;
  statusEl.textContent = '確認中...';
  try {
    const latest = await fetchLatestVersion();
    if (latest === APP_VERSION) {
      statusEl.textContent = `最新版です(バージョン ${APP_VERSION})`;
    } else {
      autoUpdateNoticeShown = true;
      await applyServiceWorkerUpdate();
      statusEl.textContent = `新しいバージョン(${latest})に更新しました。アプリを完全に閉じて開き直してください。`;
    }
  } catch (err) {
    console.error('バージョン確認に失敗:', err);
    statusEl.textContent = '確認できませんでした。ネット接続を確認してください。';
  } finally {
    btn.disabled = false;
  }
}

// ===== 曲情報の編集(タイトル・アーティスト・アルバム・ジャンル・年、と並び順用の読み) =====
const EDIT_FIELDS = [
  ['title', 'edit-title'], ['artist', 'edit-artist'], ['album', 'edit-album'], ['genre', 'edit-genre'], ['year', 'edit-year'],
  ['titleSort', 'edit-title-sort'], ['artistSort', 'edit-artist-sort'], ['albumSort', 'edit-album-sort'],
];
let editingTrack = null;
let viewBeforeEdit = 'view-library';
// ジャケット写真の変更は、保存を押すまで確定しない: undefined=変更なし / null=削除 / Blob=差し替え
let editingArtwork;
let editingArtworkPreviewUrl = null; // 選び直した画像のプレビュー用object URL(閉じるときに解放する)

function updateEditArtworkPreview(track) {
  const img = document.getElementById('edit-artwork-preview');
  if (editingArtworkPreviewUrl) { URL.revokeObjectURL(editingArtworkPreviewUrl); editingArtworkPreviewUrl = null; }
  if (editingArtwork === null) { img.src = 'icons/default-artwork.png'; return; }
  if (editingArtwork) { editingArtworkPreviewUrl = URL.createObjectURL(editingArtwork); img.src = editingArtworkPreviewUrl; return; }
  img.src = getArtworkUrl(track);
}

function openEditTrack(track) {
  editingTrack = track;
  editingArtwork = undefined;
  const active = document.querySelector('.view.active');
  viewBeforeEdit = active ? active.id : 'view-library';
  EDIT_FIELDS.forEach(([key, id]) => {
    document.getElementById(id).value = key === 'artist' && track.artist === UNKNOWN_ARTIST ? '' : (track[key] || '');
  });
  document.getElementById('edit-file-name').textContent = (track.fileBlob && track.fileBlob.name) || '';
  updateEditArtworkPreview(track);
  showView('view-edit-track');
  document.getElementById('view-edit-track').scrollTop = 0;
}

function closeEditTrack() {
  editingTrack = null;
  editingArtwork = undefined;
  if (editingArtworkPreviewUrl) { URL.revokeObjectURL(editingArtworkPreviewUrl); editingArtworkPreviewUrl = null; }
  showView(viewBeforeEdit);
}

// ジャンルの選択肢: 「年代」タブで年を選んだときのチップと同じ順(J-Pop→Anime→洋楽→その他のジャンルをあいうえお順)
function genrePickerOptions() {
  const origins = ORIGIN_DEFS.map(d => originDisplayLabel(d));
  const others = [...new Set(tracks.map(t => (t.genre || '').trim()).filter(g => g && !originKey({ genre: g })))]
    .sort((a, b) => {
      if (a === '不明') return 1;
      if (b === '不明') return -1;
      return a.localeCompare(b, 'ja');
    });
  return [...origins, ...others];
}
async function openGenrePicker() {
  const options = genrePickerOptions();
  if (options.length === 0) { dialogAlert('ライブラリにまだジャンルがありません。直接入力してください'); return; }
  const idx = await showChoiceSheet('ジャンルを選ぶ', options);
  if (idx < 0) return;
  document.getElementById('edit-genre').value = options[idx];
}

// 年の選択肢: 2026年から下に下がっていく
const YEAR_PICKER_MAX = 2026, YEAR_PICKER_MIN = 1950;
async function openYearPicker() {
  const options = [];
  for (let y = YEAR_PICKER_MAX; y >= YEAR_PICKER_MIN; y--) options.push(String(y));
  const idx = await showChoiceSheet('年を選ぶ', options);
  if (idx < 0) return;
  document.getElementById('edit-year').value = options[idx];
}

// 選んだ画像を、新しいジャケットとして差し替える(保存を押すまでは反映しない)
async function applyEditArtworkChange(track) {
  if (editingArtwork === undefined) return; // 変更していなければ何もしない
  track.artworkBlob = editingArtwork; // null(削除)ならそのまま null に
  artworkUrlCache.delete(track.id);
  thumbUrlCache.delete(track.id);
  thumbMap.delete(track.id);
  await DB.deleteThumb(track.id); // 古い一覧用の小さな画像を消し、作り直す
  track.artworkScanned = true;
  if (track.artworkBlob) await saveThumb(track);
}

async function saveEditTrack() {
  const track = editingTrack;
  if (!track) return;
  const val = (id) => document.getElementById(id).value.trim();
  if (!val('edit-title')) { dialogAlert('タイトルを入力してください'); return; }
  const year = val('edit-year').normalize('NFKC');
  if (year && !/^\d{4}$/.test(year)) { dialogAlert('年は、西暦4けたの数字で入力してください(例: 2005)'); return; }
  EDIT_FIELDS.forEach(([key, id]) => { track[key] = key === 'year' ? year : val(id); });
  if (!track.artist) track.artist = UNKNOWN_ARTIST;
  track.readingsScanned = true; // 読みは自分で決めたので、ファイルのタグで上書きしない
  await applyEditArtworkChange(track);
  await DB.updateTrack(track);
  markLibraryChanged();
  document.querySelectorAll('ul').forEach((ul) => { if (ul._v) updateVirtualWindow(ul, true); }); // 表示中の行を新しい内容に
  renderPlaylistList();
  if (currentTrack && currentTrack.id === track.id) updateNowPlayingUI();
  renderQueueIfOpen();
  closeEditTrack();
}

// ===== 曲の行を右へスワイプ → 「次に再生」(Apple Musicと同じ)。ボタンは出さず、一定以上動かして指を離したときだけ実行する =====
function bindSwipeToPlayNext(listEl) {
  const THRESH = 72; // このくらい右へ動かして離すと、次に再生に追加する
  let st = null;
  let suppressClick = false;
  listEl.addEventListener('pointerdown', (e) => {
    const li = e.target.closest('.track-item');
    if (!li || li.classList.contains('add-row') || !listEl.contains(li) || e.clientX < 24) return; // 画面の左端は、iOSの「戻る」操作と重なるので使わない
    st = { li, x0: e.clientX, y0: e.clientY, dragging: false, dx: 0 };
  });
  listEl.addEventListener('pointermove', (e) => {
    if (!st) return;
    const dx = e.clientX - st.x0;
    const dy = e.clientY - st.y0;
    if (!st.dragging) {
      if (dx < -8 || Math.abs(dy) > 12 && Math.abs(dy) > dx) { st = null; return; } // 左や縦の動きは、スクロールなどに任せる
      if (dx < 8 || dx < Math.abs(dy) * 1.5) return;
      st.dragging = true;
      if (!st.li.querySelector('.swipe-hint')) {
        const hint = document.createElement('div');
        hint.className = 'swipe-hint';
        hint.textContent = '＋ 次に再生';
        st.li.appendChild(hint);
      }
      st.li.classList.add('swipe-active');
      try { st.li.setPointerCapture(e.pointerId); } catch (err) { /* 無視 */ }
    }
    st.dx = Math.max(0, Math.min(dx, 150));
    st.li.style.setProperty('--sx', `${st.dx}px`);
    st.li.querySelector('.swipe-hint').classList.toggle('ready', st.dx >= THRESH);
  });
  const finish = (allowRun) => {
    if (!st) return;
    const { li, dragging, dx } = st;
    st = null;
    if (!dragging) return;
    suppressClick = true;
    setTimeout(() => { suppressClick = false; }, 60); // 指を離した直後の click で、曲が再生されないようにする
    li.classList.remove('swipe-active');
    li.style.removeProperty('--sx');
    if (allowRun && dx >= THRESH) {
      const t = tracks.find(x => String(x.id) === li.dataset.trackId);
      if (t) enqueue(t, true);
    }
  };
  listEl.addEventListener('pointerup', () => finish(true));
  listEl.addEventListener('pointercancel', () => finish(false));
  listEl.addEventListener('click', (e) => { if (suppressClick) { e.stopPropagation(); e.preventDefault(); } }, true);
}

// ===== 再生待ち(次に再生 / 最後に再生 / 再生待ち画面) =====
function showToast(text) {
  let el = document.getElementById('toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; el.className = 'toast'; document.body.appendChild(el); }
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => el.classList.remove('show'), 1600);
}

// next=true: 今の曲の次に入れる / false: 再生待ちの最後に入れる。何も再生していなければ、その曲を再生し始める
function enqueue(track, next) {
  if (!currentTrack) { playTrackById(track.id, [track.id]); return; }
  if (next) {
    currentQueue.splice(currentIndex + 1, 0, track.id);
    const bi = baseQueue.indexOf(currentTrack.id);
    baseQueue.splice(bi >= 0 ? bi + 1 : baseQueue.length, 0, track.id);
  } else {
    currentQueue.push(track.id);
    baseQueue.push(track.id);
  }
  showToast(next ? '次に再生します' : '再生待ちの最後に追加しました');
  renderQueueIfOpen();
}

const QUEUE_SHOW_MAX = 300; // 画面に出す「次はこちら」の最大数(それ以降も、再生はされる)
function queueRowHTML(t, pos, withHandle) {
  return `<li class="edit-row queue-row" data-pos="${pos}"><img class="track-artwork" decoding="async" src="${getThumbUrl(t)}" alt="">` +
    `<div class="track-meta"><div class="track-title">${esc(t.title)}</div><div class="track-artist">${esc(t.artist)}</div></div>` +
    (withHandle ? `<button class="track-menu-btn">⋯</button><div class="drag-handle">≡</div>` : '') + `</li>`;
}
function renderQueue() {
  const cur = document.getElementById('queue-current');
  cur.innerHTML = currentTrack ? `<ul class="track-list">${queueRowHTML(currentTrack, -1, false)}</ul>` : '<p class="empty-hint">再生中の曲はありません</p>';
  const byId = new Map(tracks.map(t => [t.id, t]));
  const rest = currentTrack ? currentQueue.slice(currentIndex + 1) : [];
  const shown = rest.slice(0, QUEUE_SHOW_MAX);
  document.getElementById('queue-title-next').textContent = `次はこちら(${rest.length}曲)`;
  document.getElementById('queue-list').innerHTML = shown.map((id, i) => byId.get(id) ? queueRowHTML(byId.get(id), i, true) : '').join('');
  document.getElementById('queue-more').textContent = rest.length > shown.length ? `このあと ${rest.length - shown.length}曲が続きます(表示は${QUEUE_SHOW_MAX}曲まで)` : '';
  refreshPlainScrollbarIfActive();
}
function renderQueueIfOpen() {
  if (document.getElementById('view-queue').classList.contains('active')) renderQueue();
}
function openQueue() { renderQueue(); showView('view-queue'); }

// 再生待ちの「次はこちら」のうち画面に出していた範囲を、並べ替えたり削除したあとの並びで置き換える
function setUpcoming(newShown) {
  const before = currentQueue.slice(0, currentIndex + 1);
  const shownCount = Math.min(QUEUE_SHOW_MAX, currentQueue.length - currentIndex - 1);
  const after = currentQueue.slice(currentIndex + 1 + shownCount);
  currentQueue = [...before, ...newShown, ...after];
  if (!isShuffle) baseQueue = currentQueue.slice(); // シャッフル中は、元の並びは触らない
  renderQueue();
}

async function openQueueRowMenu(pos) {
  const idx = await showChoiceSheet('再生待ちの操作', ['再生待ちから削除']);
  if (idx !== 0) return;
  const shown = currentQueue.slice(currentIndex + 1, currentIndex + 1 + QUEUE_SHOW_MAX);
  const removed = shown.splice(pos, 1)[0];
  const bi = baseQueue.indexOf(removed);
  if (isShuffle && bi >= 0) baseQueue.splice(bi, 1); // シャッフル中でも、あとで元の並びに戻したときに、また出てこないように
  setUpcoming(shown);
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
  setRepeatUI();
  savePlaybackState(true);
}

// ===== 再生速度 =====
const SPEED_STEPS = [0.75, 1, 1.25, 1.5, 1.75, 2];
let playbackSpeed = Settings.get('playbackSpeed') || 1;
function applyPlaybackSpeed() {
  audioA.playbackRate = playbackSpeed;
  audioB.playbackRate = playbackSpeed;
  document.getElementById('btn-speed').textContent = `${playbackSpeed}x`;
  document.getElementById('btn-speed').classList.toggle('active', playbackSpeed !== 1);
}
function cycleSpeed() {
  const i = SPEED_STEPS.indexOf(playbackSpeed);
  playbackSpeed = SPEED_STEPS[(i + 1) % SPEED_STEPS.length];
  applyPlaybackSpeed();
  Settings.set('playbackSpeed', playbackSpeed);
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
  document.getElementById('btn-lyrics-expand').classList.toggle('hidden', !hasLyrics);
  if (!hasLyrics) setLyricsExpanded(false); // 歌詞が無い曲に切り替わったら、拡大表示も解除する
  lastActiveLyricIdx = -1;
  updateLyricsPane();
}

function showMiniPlayer() {
  document.getElementById('mini-player').classList.remove('hidden');
  if (document.body.classList.contains('mini-open')) return; // 既に表示済みなら、下の再計算は不要
  document.body.classList.add('mini-open'); // 一覧の下端が、ミニプレイヤーに隠れてタップできなくならないよう、画面自体の高さを詰める
  // 高さが変わった直後なので、今見えている一覧の描画範囲・見た目だけのスクロールバーを、新しい高さに合わせ直す
  const active = document.querySelector('.view.active');
  if (active) {
    active.querySelectorAll('ul').forEach((ul) => { if (ul._v) updateVirtualWindow(ul, true); });
    refreshPlainScrollbarIfActive();
  }
}

// ===== スリープタイマー =====
function sleepTimerStatusText() {
  if (sleepTimerEndOfTrack) return 'この曲が終わるまで';
  if (sleepTimerEndAt) return `あと約${Math.max(1, Math.round((sleepTimerEndAt - Date.now()) / 60000))}分`;
  return null;
}
function updateSleepTimerUI() {
  document.getElementById('btn-sleep-timer').classList.toggle('active', !!(sleepTimerId || sleepTimerEndOfTrack));
}
function clearSleepTimer() {
  if (sleepTimerId) clearTimeout(sleepTimerId);
  sleepTimerId = null;
  sleepTimerEndAt = null;
  sleepTimerEndOfTrack = false;
  updateSleepTimerUI();
}
function setSleepTimer(minutes) {
  clearSleepTimer();
  sleepTimerEndAt = Date.now() + minutes * 60000;
  sleepTimerId = setTimeout(() => {
    audioEl.pause();
    sleepTimerId = null;
    sleepTimerEndAt = null;
    updateSleepTimerUI();
    showToast('スリープタイマーで再生を止めました');
  }, minutes * 60000);
  updateSleepTimerUI();
}
function setSleepTimerEndOfTrack() {
  clearSleepTimer();
  sleepTimerEndOfTrack = true;
  updateSleepTimerUI();
}
async function openSleepTimerSheet() {
  const status = sleepTimerStatusText();
  const options = ['15分', '30分', '45分', '60分', '曲の終わりまで'];
  if (status) options.push('タイマーを解除');
  const idx = await showChoiceSheet(status ? `スリープタイマー(${status})` : 'スリープタイマー', options);
  if (idx < 0) return;
  const label = options[idx];
  if (label === 'タイマーを解除') { clearSleepTimer(); showToast('スリープタイマーを解除しました'); return; }
  if (label === '曲の終わりまで') { setSleepTimerEndOfTrack(); showToast('この曲が終わったら再生を止めます'); return; }
  const minutes = parseInt(label, 10);
  setSleepTimer(minutes);
  showToast(`${minutes}分後に再生を止めます`);
}

// アプリが裏に回る/閉じられる直前にも保存する
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') { savePlaybackState(true); return; }
  attemptResume(5, true); // 電話などで強制的に止められて、画面に戻ってきたときは、自動で再開する
  autoCheckUpdateSilently(); // ホーム画面から復帰したときにも、新しいバージョンがないか裏で確認する
});
window.addEventListener('pagehide', () => savePlaybackState(true));
window.addEventListener('focus', () => attemptResume(5, true)); // 電話の終了直後など、visibilitychangeが起きない場合の保険

function bindAudioEvents() {
  // 2つのaudio要素の両方に付けて、今、曲を鳴らしている方のイベントだけ処理する
  const onAudio = (name, fn) => [audioA, audioB].forEach(el => el.addEventListener(name, (e) => { if (el === audioEl) fn(e); }));
  // 歌詞の切り替えは、再生中だけ毎フレーム確認する(timeupdateは約0.25秒に1回なので、それだけだと歌詞が遅れて見える)
  let lyricRaf = null;
  const lyricLoop = () => {
    highlightCurrentLyricLine();
    lyricRaf = audioEl.paused ? null : requestAnimationFrame(lyricLoop);
  };
  onAudio('play', () => { setPlayPauseIcon(true); if (lyricRaf === null) lyricRaf = requestAnimationFrame(lyricLoop); });
  onAudio('pause', () => { clearJointStartTimer(); savePlaybackState(true); setPlayPauseIcon(false); if (lyricRaf !== null) { cancelAnimationFrame(lyricRaf); lyricRaf = null; } });
  onAudio('seeked', () => { clearJointStartTimer(); highlightCurrentLyricLine(); });
  onAudio('ended', () => {
    if (sleepTimerEndOfTrack) {
      sleepTimerEndOfTrack = false;
      updateSleepTimerUI();
      showToast('スリープタイマーで再生を止めました');
      return; // 次の曲へは進まず、ここで止まる
    }
    if (repeatMode === 'one') {
      playCounted = false;
      audioEl.currentTime = 0;
      audioEl.play().catch(() => {});
      return;
    }
    playNext();
  });
  onAudio('timeupdate', () => {
    highlightCurrentLyricLine();
    checkJoint();
    savePlaybackState(false);
    // 30秒(短い曲は半分)聴いたら、1回再生したことにする → 「最近再生した曲」
    if (currentTrack && !playCounted && audioEl.duration && audioEl.currentTime >= Math.min(30, audioEl.duration / 2)) {
      playCounted = true;
      currentTrack.playCount = (currentTrack.playCount || 0) + 1;
      currentTrack.lastPlayedAt = Date.now();
      DB.updateTrack(currentTrack);
      renderPlaylistList();
    }
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
  onAudio('loadedmetadata', () => {
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
  const hidden = pane.classList.contains('hidden');
  document.getElementById('btn-lyrics-expand').classList.toggle('hidden', hidden);
  if (hidden) {
    document.getElementById('lyric-offset').classList.add('hidden'); // 歌詞を隠すときは調整ボタンも隠す
    setLyricsExpanded(false);
  } else {
    lastActiveLyricIdx = -1;
    updateLyricsPane();
  }
}

// 歌詞の拡大表示(Spotifyのフルスクリーン歌詞のように、歌詞だけを画面いっぱいに大きく出す)
function setLyricsExpanded(on) {
  document.body.classList.toggle('lyrics-expanded', on);
  document.getElementById('btn-lyrics-expand').classList.toggle('active', on);
}
function toggleLyricsExpanded() {
  setLyricsExpanded(!document.body.classList.contains('lyrics-expanded'));
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
      const text = dialogPrompt('歌詞を入力してください', '');
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
  navigator.mediaSession.setActionHandler('play', () => { wantsToPlay = true; attemptResume(5, true); });
  navigator.mediaSession.setActionHandler('pause', () => { wantsToPlay = false; audioEl.pause(); });
  navigator.mediaSession.setActionHandler('previoustrack', playPrev);
  navigator.mediaSession.setActionHandler('nexttrack', playNext);
  // 「シーク(ドラッグして頭出し)」を登録すると、iOSが前へ/次へボタンの代わりにシークのボタンを
  // 出してしまい、前へ/次へが使えなくなることがあるため、あえて登録しない
  try { navigator.mediaSession.setActionHandler('seekto', null); } catch (e) {}
}

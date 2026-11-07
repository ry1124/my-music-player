// IndexedDB ラッパー: 曲データ(音声Blob/アートワーク/歌詞)とプレイリストを永続化する
const DB_NAME = 'MyMusicDB';
const DB_VERSION = 3; // 2: 一覧用サムネイルの保存領域(thumbs)を追加 / 3: 音声ファイル本体(fileBlob/normBlob)をtracksから分離(audio)
let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (event) => {
      const db = req.result;
      if (!db.objectStoreNames.contains('tracks')) {
        const store = db.createObjectStore('tracks', { keyPath: 'id', autoIncrement: true });
        store.createIndex('title', 'title', { unique: false });
        store.createIndex('addedAt', 'addedAt', { unique: false });
      }
      if (!db.objectStoreNames.contains('thumbs')) {
        db.createObjectStore('thumbs'); // キー = 曲のid、値 = 小さなジャケット画像(Blob)
      }
      if (!db.objectStoreNames.contains('playlists')) {
        db.createObjectStore('playlists', { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains('audio')) {
        // キー = 曲のid、値 = { fileBlob, normBlob }。曲情報(tracks)とは別にしておき、
        // お気に入り・歌詞・曲情報の編集のたびに、数MBある音声ファイル本体まで書き直さずに済むようにする
        db.createObjectStore('audio');
      }
      // 既存の曲データ(tracksに音声ファイル本体が直接入っていた形式)から、音声ファイル本体をaudioストアへ移す(一度だけ)
      if (event.oldVersion > 0 && event.oldVersion < 3 && db.objectStoreNames.contains('tracks')) {
        const tx = req.transaction;
        const trackStore = tx.objectStore('tracks');
        const audioStore = tx.objectStore('audio');
        trackStore.openCursor().onsuccess = (e) => {
          const cursor = e.target.result;
          if (!cursor) return;
          const rec = cursor.value;
          if (rec.fileBlob !== undefined || rec.normBlob !== undefined) {
            audioStore.put({ fileBlob: rec.fileBlob, normBlob: rec.normBlob || null }, rec.id);
            delete rec.fileBlob;
            delete rec.normBlob;
            cursor.update(rec);
          }
          cursor.continue();
        };
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(storeName, mode) {
  return openDB().then(db => db.transaction(storeName, mode).objectStore(storeName));
}

function promisifyRequest(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// トランザクション全体の完了を待つ(複数ストアへ書き込むとき用)
function txDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

// 書き込み中の数。アプリの更新(画面の読み込み直し)は、これが0のときだけ行う(書き込みの途中で読み込み直すと、変更が消えるため)
let pendingDbWrites = 0;
// 1つのストアへの書き込み。要求の成功だけでなく、トランザクションが確定するまで待つ(確定前にアプリが閉じられても消えにくくする)
function writeStore(storeName, fn) {
  pendingDbWrites++;
  return openDB().then((db) => {
    const t = db.transaction(storeName, 'readwrite');
    const req = fn(t.objectStore(storeName));
    return Promise.all([promisifyRequest(req), txDone(t)]).then(([v]) => v);
  }).finally(() => { pendingDbWrites--; });
}
function trackWrite(promise) {
  pendingDbWrites++;
  return promise.finally(() => { pendingDbWrites--; });
}

const DB = {
  hasPendingWrites() { return pendingDbWrites > 0; },
  // 曲を新規に追加する。音声ファイル本体(fileBlob/normBlob)は、曲情報とは別のストアに保存する
  addTrack(track) {
    return trackWrite((async () => {
      const { fileBlob, normBlob, ...meta } = track;
      const db = await openDB();
      const transaction = db.transaction(['tracks', 'audio'], 'readwrite');
      const id = await promisifyRequest(transaction.objectStore('tracks').add(meta));
      transaction.objectStore('audio').put({ fileBlob, normBlob: normBlob || null }, id);
      await txDone(transaction);
      return id;
    })());
  },
  async getAllTracks() {
    const [metas, audioMap] = await Promise.all([
      tx('tracks', 'readonly').then(store => promisifyRequest(store.getAll())),
      DB._getAllAudio(),
    ]);
    return metas.map((m) => {
      const a = audioMap.get(m.id);
      return { ...m, fileBlob: a ? a.fileBlob : undefined, normBlob: a ? (a.normBlob || null) : null };
    });
  },
  async _getAllAudio() {
    const store = await tx('audio', 'readonly');
    const [keys, values] = await Promise.all([promisifyRequest(store.getAllKeys()), promisifyRequest(store.getAll())]);
    return new Map(keys.map((k, i) => [k, values[i]]));
  },
  async getTrack(id) {
    const [meta, audio] = await Promise.all([
      tx('tracks', 'readonly').then(store => promisifyRequest(store.get(id))),
      tx('audio', 'readonly').then(store => promisifyRequest(store.get(id))),
    ]);
    if (!meta) return undefined;
    return { ...meta, fileBlob: audio ? audio.fileBlob : undefined, normBlob: audio ? (audio.normBlob || null) : null };
  },
  deleteTrack(id) {
    return trackWrite((async () => {
      const db = await openDB();
      const transaction = db.transaction(['tracks', 'audio'], 'readwrite');
      transaction.objectStore('tracks').delete(id);
      transaction.objectStore('audio').delete(id);
      return txDone(transaction);
    })());
  },
  // 曲情報(メタデータ)だけを書き直す。音声ファイル本体は触らない(お気に入り・歌詞・曲情報の編集などで毎回呼ばれるため、
  // 重い音声ファイルまで書き直すと、編集のたびに数MBの書き込みが走ってしまう)
  updateTrack(track) {
    const { fileBlob, normBlob, ...meta } = track;
    return writeStore('tracks', store => store.put(meta));
  },
  // 音声ファイル本体(音量をそろえたファイルの作り直しなど)を更新するときだけ使う
  updateTrackAudio(id, { fileBlob, normBlob }) {
    return writeStore('audio', store => store.put({ fileBlob, normBlob: normBlob || null }, id));
  },
  // ---- 一覧用サムネイル(曲データ本体とは別に保存する。曲データを書き換えずに済む) ----
  async getAllThumbs() {
    const store = await tx('thumbs', 'readonly');
    const [keys, values] = await Promise.all([promisifyRequest(store.getAllKeys()), promisifyRequest(store.getAll())]);
    return new Map(keys.map((k, i) => [k, values[i]]));
  },
  putThumb(id, blob) {
    return writeStore('thumbs', store => store.put(blob, id));
  },
  deleteThumb(id) {
    return writeStore('thumbs', store => store.delete(id));
  },
  addPlaylist(playlist) {
    return writeStore('playlists', store => store.add(playlist));
  },
  async getAllPlaylists() {
    const store = await tx('playlists', 'readonly');
    return promisifyRequest(store.getAll());
  },
  async getPlaylist(id) {
    const store = await tx('playlists', 'readonly');
    return promisifyRequest(store.get(id));
  },
  updatePlaylist(playlist) {
    return writeStore('playlists', store => store.put(playlist));
  },
  deletePlaylist(id) {
    return writeStore('playlists', store => store.delete(id));
  },
};

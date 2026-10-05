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

const DB = {
  // 曲を新規に追加する。音声ファイル本体(fileBlob/normBlob)は、曲情報とは別のストアに保存する
  async addTrack(track) {
    const { fileBlob, normBlob, ...meta } = track;
    const db = await openDB();
    const transaction = db.transaction(['tracks', 'audio'], 'readwrite');
    const id = await promisifyRequest(transaction.objectStore('tracks').add(meta));
    transaction.objectStore('audio').put({ fileBlob, normBlob: normBlob || null }, id);
    await txDone(transaction);
    return id;
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
  async deleteTrack(id) {
    const db = await openDB();
    const transaction = db.transaction(['tracks', 'audio'], 'readwrite');
    transaction.objectStore('tracks').delete(id);
    transaction.objectStore('audio').delete(id);
    return txDone(transaction);
  },
  // 曲情報(メタデータ)だけを書き直す。音声ファイル本体は触らない(お気に入り・歌詞・曲情報の編集などで毎回呼ばれるため、
  // 重い音声ファイルまで書き直すと、編集のたびに数MBの書き込みが走ってしまう)
  async updateTrack(track) {
    const { fileBlob, normBlob, ...meta } = track;
    const store = await tx('tracks', 'readwrite');
    return promisifyRequest(store.put(meta));
  },
  // 音声ファイル本体(音量をそろえたファイルの作り直しなど)を更新するときだけ使う
  async updateTrackAudio(id, { fileBlob, normBlob }) {
    const store = await tx('audio', 'readwrite');
    return promisifyRequest(store.put({ fileBlob, normBlob: normBlob || null }, id));
  },
  // ---- 一覧用サムネイル(曲データ本体とは別に保存する。曲データを書き換えずに済む) ----
  async getAllThumbs() {
    const store = await tx('thumbs', 'readonly');
    const [keys, values] = await Promise.all([promisifyRequest(store.getAllKeys()), promisifyRequest(store.getAll())]);
    return new Map(keys.map((k, i) => [k, values[i]]));
  },
  async putThumb(id, blob) {
    const store = await tx('thumbs', 'readwrite');
    return promisifyRequest(store.put(blob, id));
  },
  async deleteThumb(id) {
    const store = await tx('thumbs', 'readwrite');
    return promisifyRequest(store.delete(id));
  },
  async addPlaylist(playlist) {
    const store = await tx('playlists', 'readwrite');
    return promisifyRequest(store.add(playlist));
  },
  async getAllPlaylists() {
    const store = await tx('playlists', 'readonly');
    return promisifyRequest(store.getAll());
  },
  async getPlaylist(id) {
    const store = await tx('playlists', 'readonly');
    return promisifyRequest(store.get(id));
  },
  async updatePlaylist(playlist) {
    const store = await tx('playlists', 'readwrite');
    return promisifyRequest(store.put(playlist));
  },
  async deletePlaylist(id) {
    const store = await tx('playlists', 'readwrite');
    return promisifyRequest(store.delete(id));
  },
};

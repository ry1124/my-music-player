// IndexedDB ラッパー: 曲データ(音声Blob/アートワーク/歌詞)とプレイリストを永続化する
const DB_NAME = 'MyMusicDB';
const DB_VERSION = 2; // 2: 一覧用サムネイルの保存領域(thumbs)を追加
let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
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

const DB = {
  async addTrack(track) {
    const store = await tx('tracks', 'readwrite');
    return promisifyRequest(store.add(track));
  },
  async getAllTracks() {
    const store = await tx('tracks', 'readonly');
    return promisifyRequest(store.getAll());
  },
  async getTrack(id) {
    const store = await tx('tracks', 'readonly');
    return promisifyRequest(store.get(id));
  },
  async deleteTrack(id) {
    const store = await tx('tracks', 'readwrite');
    return promisifyRequest(store.delete(id));
  },
  async updateTrack(track) {
    const store = await tx('tracks', 'readwrite');
    return promisifyRequest(store.put(track));
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

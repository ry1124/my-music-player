// オフラインでも起動できるように、アプリ本体のファイルをキャッシュする
importScripts('./js/version.js');
const CACHE_NAME = 'my-music-cache-' + APP_VERSION;
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/version.js',
  './js/db.js',
  './js/settings.js',
  './js/audio-engine.js',
  './js/tags-fast.js',
  './js/season-songs.js',
  './js/app.js',
  './js/backup.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/default-artwork.png',
  './js/jsmediatags.min.js',
  './js/lamejs.min.js',
  './js/mp3-worker.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// 置き場所によっては「index.html → /」のように転送(リダイレクト)されることがある。転送を経た応答を
// そのまま画面の読み込みに返すと、iPhoneでは開けなくなる(エラーになる)ため、転送の印を外した応答に作り直す
function cleanResponse(res) {
  if (!res || !res.redirected) return Promise.resolve(res);
  return res.blob().then((body) => new Response(body, { status: res.status, statusText: res.statusText, headers: res.headers }));
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cleanResponse(cached);
      return fetch(event.request)
        .then(cleanResponse)
        .then((res) => {
          if (res && res.status === 200 && (res.type === 'basic' || res.type === 'default')) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return res;
        })
        .catch(() => cached);
    })
  );
});

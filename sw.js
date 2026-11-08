// Service worker: guarda os arquivos do jogo para abrir rápido e funcionar sem internet.
// Ao publicar uma versão nova, aumente VERSAO para renovar o cache.
const VERSAO = 'valdaria-v18';
const BASE = ['./', './index.html', './css/style.css', './js/data.js', './js/audio.js', './js/scene.js', './js/scene3d.js', './js/net.js', './js/game.js',
  './js/vendor/three.min.js', './js/vendor/GLTFLoader.js', './js/vendor/SkeletonUtils.js', './manifest.webmanifest', './assets/icons/icon-192.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(VERSAO).then((c) => c.addAll(BASE).catch(() => {})).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSAO).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
// rede primeiro (pega versões novas); se falhar, usa o que está guardado
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(fetch(req).then((res) => { if (res.ok) { const cp = res.clone(); caches.open(VERSAO).then((c) => c.put(req, cp)); } return res; }).catch(() => caches.match(req).then((r) => r || caches.match('./index.html'))));
});

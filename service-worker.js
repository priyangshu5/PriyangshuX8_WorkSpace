/**
 * PriyangshuX8 Workspace - Service Worker
 * Cache-first app shell with offline fallback. Paths are RELATIVE so the app
 * works both at a domain root and under a GitHub Pages subpath
 * (e.g. https://user.github.io/priyangshu/).
 */
/**
 * PriyangshuX8 Workspace - Service Worker
 * Cache-first app shell with offline fallback, plus runtime caching of pinned
 * CDN ES modules (Three.js, Matter.js) so the 3D/Physics studio works offline
 * after the first online load. Paths are RELATIVE for GitHub Pages subpaths.
 */
const CACHE_VERSION = 'px8-v9';
const RUNTIME_CACHE = 'px8-runtime-v9';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './assets/css/styles.css',
  './assets/css/apps.css',
  './assets/css/code-studio.css',
  './assets/css/lab.css',
  './assets/css/sim.css',
  './assets/css/studio3d.css',
  './js/core/kernel.js',
  './js/storage/store.js',
  './js/ui/theme.js',
  './js/windows/window-manager.js',
  './js/desktop/desktop.js',
  './js/filesystem/vfs.js',
  './js/lab/components.js',
  './js/simulator/interpreter.js',
  './js/simulator/engine.js',
  './js/graphics/three-scene.js',
  './js/physics/physics-world.js',
  './js/desktop/apps/file-manager.js',
  './js/desktop/apps/terminal.js',
  './js/desktop/apps/code-studio.js',
  './js/desktop/apps/lab.js',
  './js/desktop/apps/studio3d.js',
  './js/projects/project-manager.js',
  './js/desktop/apps/projects.js',
  './js/desktop/apps/settings.js',
  './js/plugins/plugin-api.js',
  './js/plugins/plugin-manager.js',
  './js/desktop/apps/plugins.js',
  './js/ai/provider.js',
  './js/ai/context-bridge.js',
  './js/desktop/apps/assistant.js',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION && k !== RUNTIME_CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  const isCDN = url.origin === 'https://cdn.jsdelivr.net';

  // Cross-origin CDN libraries: cache-first into the runtime cache.
  if (isCDN) {
    event.respondWith(
      caches.open(RUNTIME_CACHE).then((cache) =>
        cache.match(request).then((hit) =>
          hit || fetch(request).then((resp) => { cache.put(request, resp.clone()); return resp; })
        )
      )
    );
    return;
  }

  // Same-origin: cache-first with offline fallback to the app shell.
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((response) => {
          if (response && response.ok && url.origin === self.location.origin) {
            const copy = response.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => caches.match('./index.html'));
    })
  );
});





self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((response) => {
          // Cache same-origin GET responses for future offline use.
          if (response && response.ok && new URL(request.url).origin === self.location.origin) {
            const copy = response.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => caches.match('./index.html'));
    })
  );
});

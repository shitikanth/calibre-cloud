import { routeRequest } from './app-shell.ts';

declare const self: ServiceWorkerGlobalScope;
declare const __APP_SHELL__: { readonly version: string; readonly paths: readonly string[] };

const shell = __APP_SHELL__;
const cachePrefix = 'calibre-cloud:shell:';
const cacheName = `${cachePrefix}${shell.version}`;
const precached = new Set(shell.paths);

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(cacheName)
      .then((cache) => cache.addAll(shell.paths.map((path) => new Request(path, { cache: path.startsWith('/assets/') ? 'default' : 'reload' })))),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((name) => name.startsWith(cachePrefix) && name !== cacheName).map((name) => caches.delete(name)))),
  );
});

self.addEventListener('fetch', (event) => {
  const route = routeRequest(event.request, self.location.origin, precached);
  if (route === 'network') return;
  const key = route === 'shell' ? '/' : event.request;
  event.respondWith(
    caches
      .open(cacheName)
      .then((cache) => cache.match(key))
      .then((cached) => cached ?? fetch(event.request)),
  );
});

import { belongsInShell, responseSource, type AppShell } from './app-shell.ts';

declare const self: ServiceWorkerGlobalScope;
declare const __APP_SHELL__: AppShell;

const shell = __APP_SHELL__;
const cachePrefix = 'calibre-cloud:shell:';
const cacheName = `${cachePrefix}${shell.version}`;
const precached = new Set(shell.paths);

async function precache(path: string, cache: Cache): Promise<void> {
  const response = await fetch(new Request(path, { cache: path.startsWith('/assets/') ? 'default' : 'reload' }));
  if (!belongsInShell(path, response)) throw new Error(`${path}: HTTP ${response.status} ${response.headers.get('content-type')}, not part of this shell`);
  await cache.put(path, response);
}

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(cacheName).then((cache) => Promise.all(shell.paths.map((path) => precache(path, cache)))));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((name) => name.startsWith(cachePrefix) && name !== cacheName).map((name) => caches.delete(name)))),
  );
});

self.addEventListener('fetch', (event) => {
  const source = responseSource(event.request, self.location.origin, precached);
  if (source === 'network') return;
  const key = source === 'shell' ? '/' : event.request;
  event.respondWith(
    caches
      .open(cacheName)
      .then((cache) => cache.match(key))
      .then((cached) => cached ?? fetch(event.request)),
  );
});

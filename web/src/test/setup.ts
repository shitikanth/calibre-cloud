import 'vitest-browser-react';
import { afterEach } from 'vitest';
import { unmountApps } from './render-app.tsx';

afterEach(async () => {
  await unmountApps();
  for (const name of await caches.keys()) await caches.delete(name);
  localStorage.clear();
});

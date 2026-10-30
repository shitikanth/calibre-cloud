import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app.tsx';
import { renderers } from './reader/renderers.ts';
import { createAppRouter } from './router.tsx';
import { storageProviders } from './storage/providers.ts';
import './index.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((error: unknown) => console.warn('Service worker not registered; the app needs a connection to open', error));
  });
}

createRoot(root).render(
  <StrictMode>
    <App router={createAppRouter()} providers={storageProviders} renderers={renderers} />
  </StrictMode>,
);

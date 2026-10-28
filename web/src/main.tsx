import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app.tsx';
import { renderers } from './reader/renderers.ts';
import { createAppRouter } from './router.tsx';
import { storageProviders } from './storage/providers.ts';
import './index.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

createRoot(root).render(
  <StrictMode>
    <App router={createAppRouter()} providers={storageProviders} renderers={renderers} />
  </StrictMode>,
);

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app.tsx';
import { createAppRouter } from './router.tsx';
import { openStorage } from './storage/providers.ts';
import './index.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

createRoot(root).render(
  <StrictMode>
    <App router={createAppRouter()} openStorage={openStorage} />
  </StrictMode>,
);

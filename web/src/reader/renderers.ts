import type { Renderers } from './renderer.ts';

export const renderers: Renderers = {
  EPUB: () => import('./epub/renderer.ts').then((module) => module.createEpubRenderer()),
  PDF: () => import('./pdf/renderer.ts').then((module) => module.createPdfRenderer()),
};

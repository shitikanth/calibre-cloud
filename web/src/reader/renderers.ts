import type { RendererFactory, Renderers } from './renderer.ts';

const foliate =
  (extension: string): RendererFactory =>
  () =>
    import('./epub/renderer.ts').then((module) => module.createEpubRenderer(extension));

export const renderers: Renderers = {
  EPUB: foliate('epub'),
  MOBI: foliate('mobi'),
  AZW: foliate('azw'),
  AZW3: foliate('azw3'),
  KF8: foliate('kf8'),
  FB2: foliate('fb2'),
  FBZ: foliate('fbz'),
  CBZ: foliate('cbz'),
  PDF: () => import('./pdf/renderer.ts').then((module) => module.createPdfRenderer()),
};

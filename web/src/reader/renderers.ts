import type { RendererFactory, Renderers } from './renderer.ts';

const foliate =
  (extension: string): RendererFactory =>
  () =>
    import('./foliate/renderer.ts').then((module) => module.createFoliateRenderer(extension));

export const renderers: Renderers = {
  EPUB: foliate('epub'),
  KEPUB: foliate('epub'),
  MOBI: foliate('mobi'),
  AZW: foliate('azw'),
  AZW3: foliate('azw3'),
  KF8: foliate('kf8'),
  PRC: foliate('prc'),
  FB2: foliate('fb2'),
  FBZ: foliate('fbz'),
  CBZ: foliate('cbz'),
  PDF: () => import('./pdf/renderer.ts').then((module) => module.createPdfRenderer()),
};

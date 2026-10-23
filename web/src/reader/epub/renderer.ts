import type { FoliateView, Location, TocItem } from 'foliate-js/view.js';
import type { BookRenderer, Relocation, TocEntry } from '../renderer.ts';

export type EpubRenderer = BookRenderer & {
  readonly sectionDocument: Document | undefined;
};

type SectionLoad = { doc: Document; index: number };

export async function createEpubRenderer(): Promise<EpubRenderer> {
  const [, cfi] = await Promise.all([import('foliate-js/view.js'), import('foliate-js/epubcfi.js')]);
  const relocateListeners = new Set<(relocation: Relocation) => void>();
  const errorListeners = new Set<(error: Error) => void>();
  let view: FoliateView | undefined;
  let toc: TocEntry[] = [];
  let sectionDocument: Document | undefined;

  const relocate = (event: Event) => {
    const { cfi: rangeCfi, fraction } = (event as CustomEvent<Location>).detail;
    if (!Number.isFinite(fraction)) return;
    const relocation = { location: cfi.collapse(rangeCfi), fraction };
    for (const listener of relocateListeners) listener(relocation);
  };

  const sectionLoaded = (event: Event) => {
    sectionDocument = (event as CustomEvent<SectionLoad>).detail.doc;
  };

  return {
    get toc() {
      return toc;
    },
    get sectionDocument() {
      return sectionDocument;
    },
    async open(blob, container) {
      const created = document.createElement('foliate-view') as FoliateView;
      created.style.cssText = 'display: block; width: 100%; height: 100%';
      created.addEventListener('relocate', relocate);
      created.addEventListener('load', sectionLoaded);
      container.replaceChildren(created);
      view = created;
      await created.open(new File([blob], 'book.epub', { type: blob.type || 'application/epub+zip' }));
      await laidOut(created);
      created.renderer.setAttribute('flow', 'paginated');
      toc = (created.book.toc ?? []).map(toTocEntry);
      await created.init({ showTextStart: true });
    },
    onRelocate(listener) {
      relocateListeners.add(listener);
      return () => relocateListeners.delete(listener);
    },
    onRenderError(listener) {
      errorListeners.add(listener);
      return () => errorListeners.delete(listener);
    },
    async goTo(location) {
      await view?.goTo(location);
    },
    async next() {
      await view?.next();
    },
    async previous() {
      await view?.prev();
    },
    destroy() {
      view?.close();
      view?.parentElement?.replaceChildren();
      view = undefined;
      sectionDocument = undefined;
      relocateListeners.clear();
      errorListeners.clear();
    },
  };
}

// The paginator re-renders on the first notification from its own ResizeObserver. If that lands
// while the first section's iframe is still parsing, it reads a document with no root element.
function laidOut(element: Element): Promise<void> {
  return new Promise((resolve) => {
    const observer = new ResizeObserver(() => {
      observer.disconnect();
      setTimeout(resolve);
    });
    observer.observe(element);
  });
}

function toTocEntry({ label, href, subitems }: TocItem): TocEntry {
  return subitems?.length ? { label, location: href, children: subitems.map(toTocEntry) } : { label, location: href };
}

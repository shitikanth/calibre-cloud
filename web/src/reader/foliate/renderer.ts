import type { FoliateView, Location, ResourceData, ResourceLoad, TocItem } from 'foliate-js/view.js';
import type { BookRenderer, ReaderStyles, ReaderTheme, Relocation, TocEntry } from '../renderer.ts';

export type FoliateRenderer = BookRenderer & {
  readonly sectionDocument: Document | undefined;
  readonly refusedResources: readonly string[];
};

type SectionLoad = { doc: Document; index: number };

type TocSection = { entry: TocEntry; index: number };

const themes: Record<ReaderTheme, { background: string; text: string; link: string }> = {
  light: { background: '#ffffff', text: '#171717', link: '#1d4ed8' },
  sepia: { background: '#f4ecd8', text: '#5b4636', link: '#8a4b08' },
  dark: { background: '#121212', text: '#e0e0e0', link: '#8ab4f8' },
};

const documentTypes = new Set(['application/xhtml+xml', 'text/html', 'image/svg+xml']);

const blankDocument = '<html xmlns="http://www.w3.org/1999/xhtml"><head></head><body></body></html>';

function stripScripts(markup: string, type: string): string {
  const doc = new DOMParser().parseFromString(markup, type as DOMParserSupportedType);
  for (const script of doc.querySelectorAll('script')) script.remove();
  for (const element of doc.querySelectorAll('*'))
    for (const name of element.getAttributeNames()) if (/^on/i.test(name)) element.removeAttribute(name);
  return new XMLSerializer().serializeToString(doc);
}

function stylesheet({ fontSize, theme }: ReaderStyles): string {
  const { background, text, link } = themes[theme];
  return [
    `html { font-size: ${fontSize}% !important; }`,
    `html, body { background: ${background} !important; color: ${text} !important; }`,
    `a:link, a:visited { color: ${link} !important; }`,
  ].join('\n');
}

export async function createFoliateRenderer(extension = 'epub'): Promise<FoliateRenderer> {
  const [, cfi] = await Promise.all([import('foliate-js/view.js'), import('foliate-js/epubcfi.js')]);
  const relocateListeners = new Set<(relocation: Relocation) => void>();
  const errorListeners = new Set<(error: Error) => void>();
  let view: FoliateView | undefined;
  let opening = false;
  const destroyed = new AbortController();
  let toc: TocEntry[] = [];
  let tocEntries = new WeakMap<TocItem, TocEntry>();
  let tocSections: TocSection[] = [];
  let sectionDocument: Document | undefined;
  const refusedResources: string[] = [];

  const renderError = (error: Error) => {
    for (const listener of errorListeners) listener(error);
  };

  const relocate = (event: Event) => {
    if (destroyed.signal.aborted) return;
    const { cfi: rangeCfi, fraction, tocItem } = (event as CustomEvent<Location>).detail;
    if (!Number.isFinite(fraction)) return;
    const tocEntry = tocItem ? tocEntries.get(tocItem) : undefined;
    const relocation: Relocation = { location: cfi.collapse(rangeCfi), fraction, ...(tocEntry ? { tocEntry } : {}) };
    for (const listener of relocateListeners) listener(relocation);
  };

  const navigate = async (failureMessage: string, action: () => Promise<unknown> | undefined) => {
    try {
      if ((await action()) === false) renderError(new Error(failureMessage));
    } catch (cause) {
      renderError(new Error(failureMessage, { cause }));
    }
  };

  const turnPage = (event: Event) => {
    const { key } = event as KeyboardEvent;
    if (key === 'ArrowRight') void renderer.next();
    else if (key === 'ArrowLeft') void renderer.previous();
  };

  const sectionLoaded = (event: Event) => {
    if (destroyed.signal.aborted) return;
    sectionDocument = (event as CustomEvent<SectionLoad>).detail.doc;
    sectionDocument.addEventListener('keydown', turnPage);
  };

  const teardown = (created: FoliateView) => {
    try {
      created.close();
    } catch {
      // foliate's close throws when no section was ever displayed; there is nothing to unload then
    }
    created.book?.destroy?.();
    created.remove();
  };

  const refuseScripts = (event: Event) => {
    const { detail } = event as CustomEvent<ResourceLoad>;
    if (!detail.isScript) return;
    detail.allow = false;
    refusedResources.push(detail.type);
  };

  const transformResource = (event: Event) => {
    const { detail } = event as CustomEvent<ResourceData>;
    const isDocument = documentTypes.has(detail.type);
    detail.data = Promise.resolve(detail.data)
      .then((data) => (isDocument && typeof data === 'string' ? stripScripts(data, detail.type) : data))
      .catch((cause: unknown) => {
        if (!isDocument) return '';
        renderError(new Error(`Failed to load ${detail.name ?? detail.type}`, { cause }));
        return blankDocument;
      });
  };

  const renderer: FoliateRenderer = {
    get toc() {
      return toc;
    },
    get sectionDocument() {
      return sectionDocument;
    },
    get refusedResources() {
      return refusedResources;
    },
    async open(blob, container, { location }) {
      const created = document.createElement('foliate-view') as FoliateView;
      created.style.cssText = 'display: block; width: 100%; height: 100%';
      created.addEventListener('relocate', relocate);
      created.addEventListener('load', sectionLoaded);
      container.replaceChildren(created);
      view = created;
      opening = true;
      try {
        await created.open(new File([blob], `book.${extension}`, { type: blob.type }));
        if (destroyed.signal.aborted) return;
        await laidOut(created, destroyed.signal);
        if (destroyed.signal.aborted) return;
        const transforms = created.book.transformTarget;
        transforms?.addEventListener('load', refuseScripts);
        transforms?.addEventListener('data', transformResource);
        created.renderer.setAttribute('flow', 'paginated');
        toc = (created.book.toc ?? []).map((item) => toTocEntry(item, tocEntries));
        tocSections = await tocSectionsOf(created, toc);
        if (destroyed.signal.aborted) return;
        const resumed =
          location !== undefined &&
          (await isResolvable(created, location)) &&
          (await created.init({ lastLocation: location }).then(() => true, () => false));
        if (destroyed.signal.aborted) return;
        if (!resumed) await created.init({ showTextStart: true });
      } catch (error) {
        if (!destroyed.signal.aborted) throw error;
      } finally {
        opening = false;
        if (destroyed.signal.aborted) teardown(created);
      }
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
      await navigate(`Could not go to ${location}`, async () => (await view?.goTo(location)) ?? false);
    },
    async goToFraction(fraction) {
      await navigate(`Could not go to ${Math.round(fraction * 100)}%`, () => view?.goToFraction(fraction));
    },
    tocEntryAt(fraction) {
      return view && entryForSection(tocSections, sectionAt(view.getSectionFractions(), fraction));
    },
    async next() {
      await navigate('Could not turn to the next page', () => view?.next());
    },
    async previous() {
      await navigate('Could not turn to the previous page', () => view?.prev());
    },
    get setStyles() {
      if (view?.renderer && !view.renderer.setStyles) return undefined;
      return (styles: ReaderStyles) => view?.renderer.setStyles?.(stylesheet(styles));
    },
    destroy() {
      destroyed.abort();
      if (view) {
        if (opening) view.remove();
        else teardown(view);
      }
      view = undefined;
      toc = [];
      tocEntries = new WeakMap();
      tocSections = [];
      sectionDocument = undefined;
      relocateListeners.clear();
      errorListeners.clear();
    },
  };
  return renderer;
}

// The paginator re-renders on the first notification from its own ResizeObserver. If that lands
// while the first section's iframe is still parsing, it reads a document with no root element.
function laidOut(element: Element, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const observer = new ResizeObserver(() => {
      observer.disconnect();
      setTimeout(resolve);
    });
    observer.observe(element);
    signal.addEventListener(
      'abort',
      () => {
        observer.disconnect();
        resolve();
      },
      { once: true },
    );
  });
}

async function isResolvable(view: FoliateView, location: string): Promise<boolean> {
  const target = await view.resolveNavigation(location);
  return !!target && target.index >= 0 && target.index < view.book.sections.length;
}

async function tocSectionsOf(view: FoliateView, toc: TocEntry[]): Promise<TocSection[]> {
  const sections = await Promise.all(
    toc.map(async (entry) => {
      const index = (await view.resolveNavigation(entry.location))?.index;
      const own = index === undefined ? [] : [{ entry, index }];
      return [...own, ...(await tocSectionsOf(view, entry.children ?? []))];
    }),
  );
  return sections.flat();
}

function sectionAt(starts: number[], fraction: number): number {
  let section = 0;
  for (let index = 0; index < starts.length - 1; index++) {
    const start = starts[index] ?? 0;
    if (start <= fraction && (starts[index + 1] ?? 0) > start) section = index;
  }
  return section;
}

function entryForSection(sections: TocSection[], section: number): TocEntry | undefined {
  const startsHere = sections.find((candidate) => candidate.index === section);
  if (startsHere) return startsHere.entry;
  return sections.findLast((candidate) => candidate.index < section)?.entry;
}

function toTocEntry(item: TocItem, entries: WeakMap<TocItem, TocEntry>): TocEntry {
  const { label, href, subitems } = item;
  const entry: TocEntry = subitems?.length
    ? { label, location: href, children: subitems.map((subitem) => toTocEntry(subitem, entries)) }
    : { label, location: href };
  entries.set(item, entry);
  return entry;
}

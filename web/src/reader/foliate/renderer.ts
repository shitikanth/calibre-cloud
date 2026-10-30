import type { ExternalLink, FoliateView, Location, Overlayer, ResourceData, ResourceLoad, TocItem } from 'foliate-js/view.js';
import type { BookRenderer, BookSearch, ReaderStyles, ReaderTheme, Relocation, SearchResult, Tap, TocEntry } from '../renderer.ts';
import { onSwipe } from '../swipe.ts';

export type FoliateRenderer = BookRenderer & {
  readonly sectionDocument: Document | undefined;
  readonly refusedResources: readonly string[];
  readonly overlay: SVGSVGElement | undefined;
};

type HighlightKind = 'picked' | 'other';

type SectionLoad = { doc: Document; index: number };

type TocSection = { entry: TocEntry; index: number; anchor?: ((doc: Document) => Range | Element | null) | undefined };

const themes: Record<ReaderTheme, { background: string; text: string; link: string }> = {
  light: { background: '#ffffff', text: '#171717', link: '#1d4ed8' },
  sepia: { background: '#f4ecd8', text: '#5b4636', link: '#8a4b08' },
  dark: { background: '#121212', text: '#e0e0e0', link: '#8ab4f8' },
};

const highlightColor = '#facc15';

const highlightOpacity: Record<HighlightKind, string> = { picked: '0.45', other: '0.2' };

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
  const externalLinkListeners = new Set<(url: string) => void>();
  const tapListeners = new Set<(tap: Tap) => void>();
  const turnListeners = new Set<() => void>();
  let view: FoliateView | undefined;
  let host: HTMLElement | undefined;
  let opening = false;
  const destroyed = new AbortController();
  let toc: TocEntry[] = [];
  let tocEntries = new WeakMap<TocItem, TocEntry>();
  let tocSections: TocSection[] = [];
  let sectionDocument: Document | undefined;
  const refusedResources: string[] = [];
  let highlighted: { overlayer: Overlayer; keys: string[] } | undefined;
  let highlightGeneration = 0;

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

  const reportExternalLink = (event: Event) => {
    event.preventDefault();
    const { href_: url } = (event as CustomEvent<ExternalLink>).detail;
    for (const listener of externalLinkListeners) listener(url);
  };

  const navigate = async (failureMessage: string, action: () => Promise<unknown> | undefined) => {
    try {
      if ((await action()) === false) renderError(new Error(failureMessage));
    } catch (cause) {
      renderError(new Error(failureMessage, { cause }));
    }
  };

  const reportTurn = () => {
    for (const listener of turnListeners) listener();
  };

  const passKeyOut = (event: KeyboardEvent) => {
    host?.dispatchEvent(new KeyboardEvent(event.type, event));
  };

  const passPressOut = (event: PointerEvent) => {
    host?.dispatchEvent(new PointerEvent(event.type, event));
  };

  const reportTap = (event: MouseEvent) => {
    const target = event.target as Element;
    if (target.closest?.('a') || target.ownerDocument.getSelection()?.isCollapsed === false) return;
    for (const listener of tapListeners) listener({ x: tapX(event, host) });
  };

  const sectionLoaded = (event: Event) => {
    if (destroyed.signal.aborted) return;
    const doc = (event as CustomEvent<SectionLoad>).detail.doc;
    sectionDocument = doc;
    doc.addEventListener('keydown', passKeyOut);
    doc.addEventListener('pointerdown', passPressOut);
    doc.addEventListener('click', reportTap);
    // foliate-js turns the page on a swipe itself; this only reports it.
    onSwipe(doc, reportTurn);
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

  const shownSection = () => view?.renderer?.getContents?.().find((contents) => contents.overlayer);

  const search: BookSearch = {
    async *find(query, signal) {
      const current = view;
      if (!current) return;
      const [{ searchMatcher }, { textWalker }] = await Promise.all([import('foliate-js/search.js'), import('foliate-js/text-walker.js')]);
      const matcher = searchMatcher(textWalker, {
        defaultLocale: current.language?.canonical,
        matchCase: false,
        matchDiacritics: false,
        matchWholeWords: false,
      });
      const starts = current.getSectionFractions();
      for (const [index, section] of current.book.sections.entries()) {
        if (!section.createDocument) continue;
        const [doc] = await Promise.all([section.createDocument(), new Promise((resolve) => setTimeout(resolve))]);
        if (signal.aborted || destroyed.signal.aborted) return;
        const start = starts[index] ?? 0;
        const span = (starts[index + 1] ?? start) - start;
        const chapterOf = chaptersIn(tocSections, index, doc);
        const shareBefore = textShareBefore(doc);
        for (const { range, excerpt } of matcher(doc, query)) {
          if (signal.aborted) return;
          const tocEntry = chapterOf(range);
          const result: SearchResult = {
            location: current.getCFI(index, range),
            excerpt: { before: excerpt.pre, match: excerpt.match, after: excerpt.post },
            fraction: start + span * shareBefore(range),
            ...(tocEntry ? { tocEntry } : {}),
          };
          yield result;
        }
      }
    },
    highlight(result, matches) {
      search.clearHighlights();
      const current = view;
      const shown = shownSection();
      if (!current || !shown?.overlayer) return;
      const { doc, overlayer: layer } = shown;
      const generation = highlightGeneration;
      const section = sectionOf(result.location);
      const others = matches.filter(({ location }) => location !== result.location && sectionOf(location) === section);
      const marks: [string, HighlightKind][] = [...others.map(({ location }): [string, HighlightKind] => [location, 'other']), [result.location, 'picked']];
      const keys: string[] = [];
      highlighted = { overlayer: layer, keys };
      void (async () => {
        for (const [location, kind] of marks) {
          const target = await current.resolveNavigation(location);
          if (generation !== highlightGeneration) return;
          const range = target?.anchor?.(doc);
          if (!range || !('startContainer' in range)) continue;
          const key = `search:${location}`;
          layer.add(key, range, drawHighlight(kind));
          keys.push(key);
        }
      })();
    },
    clearHighlights() {
      highlightGeneration += 1;
      if (highlighted) for (const key of highlighted.keys) highlighted.overlayer.remove(key);
      highlighted = undefined;
    },
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
    get overlay() {
      return shownSection()?.overlayer?.element;
    },
    async open(blob, container, { location }) {
      const created = document.createElement('foliate-view') as FoliateView;
      created.style.cssText = 'display: block; width: 100%; height: 100%';
      created.addEventListener('relocate', relocate);
      created.addEventListener('load', sectionLoaded);
      created.addEventListener('external-link', reportExternalLink);
      created.addEventListener('click', reportTap);
      container.replaceChildren(created);
      view = created;
      host = container;
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
        if (!matchMedia('(prefers-reduced-motion: reduce)').matches) created.renderer.setAttribute('animated-snap', '');
        toc = (created.book.toc ?? []).map((item) => toTocEntry(item, tocEntries));
        tocSections = await tocSectionsOf(created, toc);
        if (destroyed.signal.aborted) return;
        const resumed =
          location !== undefined &&
          (await isResolvable(created, location)) &&
          (await created.init({ lastLocation: location }).then(() => true, () => false));
        if (destroyed.signal.aborted) return;
        if (!resumed) await created.init({ showTextStart: true });
        if (!destroyed.signal.aborted) created.renderer.setAttribute('margin', '16px');
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
    onExternalLink(listener) {
      externalLinkListeners.add(listener);
      return () => externalLinkListeners.delete(listener);
    },
    onTap(listener) {
      tapListeners.add(listener);
      return () => tapListeners.delete(listener);
    },
    onTurn(listener) {
      turnListeners.add(listener);
      return () => turnListeners.delete(listener);
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
    get search() {
      if (view?.book && !view.book.sections.some((section) => section.createDocument)) return undefined;
      return search;
    },
    destroy() {
      destroyed.abort();
      highlighted = undefined;
      if (view) {
        if (opening) view.remove();
        else teardown(view);
      }
      view = undefined;
      host = undefined;
      toc = [];
      tocEntries = new WeakMap();
      tocSections = [];
      sectionDocument = undefined;
      relocateListeners.clear();
      errorListeners.clear();
      externalLinkListeners.clear();
      tapListeners.clear();
      turnListeners.clear();
    },
  };
  return renderer;
}

function sectionOf(cfi: string): string {
  return cfi.slice(0, cfi.indexOf('!'));
}

function drawHighlight(kind: HighlightKind) {
  return (rects: DOMRectList) => {
    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    group.dataset.highlight = kind;
    group.setAttribute('fill', highlightColor);
    group.setAttribute('fill-opacity', highlightOpacity[kind]);
    for (const { left, top, width, height } of rects) {
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      for (const [name, value] of Object.entries({ x: left, y: top, width, height })) rect.setAttribute(name, String(value));
      group.append(rect);
    }
    return group;
  };
}

// Takes ranges in document order, so each call only counts the text since the last.
function textShareBefore(doc: Document): (range: Range) => number {
  const root = doc.body ?? doc.documentElement;
  const total = root.textContent?.length ?? 0;
  const gap = doc.createRange();
  gap.setStart(root, 0);
  let counted = 0;
  return (range) => {
    gap.setEnd(range.startContainer, range.startOffset);
    counted += gap.toString().length;
    gap.setStart(range.startContainer, range.startOffset);
    return total > 0 ? Math.min(counted / total, 1) : 0;
  };
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

function tapX(event: MouseEvent, host: HTMLElement | undefined): number {
  const doc = (event.target as Node).ownerDocument;
  const frame = doc && doc !== host?.ownerDocument ? (doc.defaultView?.frameElement as HTMLElement | null) : null;
  if (!frame) return event.clientX;
  const { left, width } = frame.getBoundingClientRect();
  return left + event.clientX * (frame.offsetWidth ? width / frame.offsetWidth : 1);
}

async function isResolvable(view: FoliateView, location: string): Promise<boolean> {
  const target = await view.resolveNavigation(location);
  return !!target && target.index >= 0 && target.index < view.book.sections.length;
}

async function tocSectionsOf(view: FoliateView, toc: TocEntry[]): Promise<TocSection[]> {
  const sections = await Promise.all(
    toc.map(async (entry) => {
      const target = await view.resolveNavigation(entry.location);
      const own = target ? [{ entry, index: target.index, anchor: target.anchor }] : [];
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

function chaptersIn(sections: TocSection[], index: number, doc: Document): (range: Range) => TocEntry | undefined {
  const starts = sections.flatMap(({ entry, index: at, anchor }): { entry: TocEntry; start: Range | undefined }[] => {
    if (at !== index) return [];
    const node = anchor?.(doc);
    if (!node || typeof node !== 'object') return [{ entry, start: undefined }];
    const start = doc.createRange();
    if ('startContainer' in node) start.setStart(node.startContainer, node.startOffset);
    else start.setStartBefore(node);
    return [{ entry, start }];
  });
  const fallback = entryForSection(sections, index);
  if (starts.length === 0) return () => fallback;
  const previous = sections.findLast((candidate) => candidate.index < index)?.entry;
  return (range) => {
    let chapter = previous;
    for (const { entry, start } of starts) if (!start || start.compareBoundaryPoints(Range.START_TO_START, range) <= 0) chapter = entry;
    return chapter ?? starts[0]?.entry;
  };
}

function toTocEntry(item: TocItem, entries: WeakMap<TocItem, TocEntry>): TocEntry {
  const { label, href, subitems } = item;
  const entry: TocEntry = subitems?.length
    ? { label, location: href, children: subitems.map((subitem) => toTocEntry(subitem, entries)) }
    : { label, location: href };
  entries.set(item, entry);
  return entry;
}

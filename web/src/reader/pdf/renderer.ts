import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { PageViewport, PDFDocumentLoadingTask, PDFDocumentProxy, PDFPageProxy, RenderTask } from 'pdfjs-dist/legacy/build/pdf.mjs';
import workerSrc from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import type { BookRenderer, BookSearch, Relocation, SearchResult, Tap, TocEntry } from '../renderer.ts';
import { onSwipe } from '../swipe.ts';
import { excerptOf, findMatches, type TextMatch } from '../text-search.ts';
import { entryStartingAt } from '../toc.ts';

pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

const wasmUrl = `${import.meta.env.BASE_URL}pdfjs/wasm/`;

type OutlineItem = NonNullable<Awaited<ReturnType<PDFDocumentProxy['getOutline']>>>[number];

type ContentItem = Awaited<ReturnType<PDFPageProxy['getTextContent']>>['items'][number];

type PlacedText = { start: number; end: number; transform: number[]; width: number };

type PageText = { text: string; pieces: PlacedText[] };

type HighlightKind = 'picked' | 'other';

type Highlights = { page: number; marks: { match: TextMatch; kind: HighlightKind }[]; scrolled: boolean };

const highlightColors: Record<HighlightKind, string> = { picked: '#facc15', other: '#fef3c7' };

export async function createPdfRenderer(): Promise<BookRenderer> {
  return new PdfRenderer();
}

class PdfRenderer implements BookRenderer {
  toc: TocEntry[] = [];
  private loadingTask: PDFDocumentLoadingTask | undefined;
  private doc: PDFDocumentProxy | undefined;
  private container: HTMLElement | undefined;
  private scroller: HTMLElement | undefined;
  private canvas: HTMLCanvasElement | undefined;
  private marks: HTMLElement | undefined;
  private viewport: PageViewport | undefined;
  private highlights: Highlights | undefined;
  private readonly pageTexts = new Map<number, PageText>();
  private readonly matchesOf = new WeakMap<SearchResult, TextMatch>();
  private page: PDFPageProxy | undefined;
  private currentPage = 1;
  private zoom = 1;
  private renderTask: RenderTask | undefined;
  private generation = 0;
  private readonly relocateListeners = new Set<(relocation: Relocation) => void>();
  private readonly errorListeners = new Set<(error: Error) => void>();
  private readonly tapListeners = new Set<(tap: Tap) => void>();
  private readonly turnListeners = new Set<() => void>();

  async open(blob: Blob, container: HTMLElement, { location }: { location?: string }): Promise<void> {
    const generation = this.generation;
    const data = await blob.arrayBuffer();
    if (generation !== this.generation) return;
    const loadingTask = pdfjs.getDocument({ data, wasmUrl });
    this.loadingTask = loadingTask;
    const doc = await loadingTask.promise;
    if (generation !== this.generation) return;
    this.doc = doc;
    this.container = container;
    this.scroller = document.createElement('div');
    this.scroller.style.cssText = 'height: 100%; overflow: auto; scrollbar-gutter: stable';
    this.canvas = document.createElement('canvas');
    this.canvas.style.display = 'block';
    this.marks = document.createElement('div');
    this.marks.style.cssText = 'position: absolute; inset: 0; pointer-events: none';
    const sheet = document.createElement('div');
    sheet.style.cssText = 'position: relative; width: fit-content';
    sheet.append(this.canvas, this.marks);
    this.scroller.append(sheet);
    this.listenForGestures(this.scroller);
    container.replaceChildren(this.scroller);
    this.toc = await mapOutline(doc, (await doc.getOutline()) ?? []);
    if (generation !== this.generation) return;
    this.zoom = 1;
    await this.show(this.resolve(location));
  }

  onRelocate(listener: (relocation: Relocation) => void): () => void {
    this.relocateListeners.add(listener);
    return () => this.relocateListeners.delete(listener);
  }

  onRenderError(listener: (error: Error) => void): () => void {
    this.errorListeners.add(listener);
    return () => this.errorListeners.delete(listener);
  }

  onExternalLink(): () => void {
    return () => {};
  }

  onTap(listener: (tap: Tap) => void): () => void {
    this.tapListeners.add(listener);
    return () => this.tapListeners.delete(listener);
  }

  onTurn(listener: () => void): () => void {
    this.turnListeners.add(listener);
    return () => this.turnListeners.delete(listener);
  }

  async goTo(location: string): Promise<void> {
    const page = Number(location);
    if (this.isPage(page)) await this.show(page);
  }

  async goToFraction(fraction: number): Promise<void> {
    if (this.doc) await this.show(this.pageAt(fraction, this.doc.numPages));
  }

  tocEntryAt(fraction: number): TocEntry | undefined {
    return this.doc && entryStartingAt(this.toc, this.pageAt(fraction, this.doc.numPages));
  }

  async next(): Promise<void> {
    if (this.doc && this.currentPage < this.doc.numPages) await this.show(this.currentPage + 1);
  }

  async previous(): Promise<void> {
    if (this.currentPage > 1) await this.show(this.currentPage - 1);
  }

  readonly search: BookSearch = {
    find: (query, signal) => this.find(query, signal),
    highlight: (result, matches) => {
      const page = Number(result.location);
      const marks: Highlights['marks'] = matches.flatMap((candidate) => {
        const match = this.matchesOf.get(candidate);
        if (!match || candidate === result || candidate.location !== result.location) return [];
        return [{ match, kind: 'other' as const }];
      });
      const picked = this.matchesOf.get(result);
      if (picked) marks.push({ match: picked, kind: 'picked' });
      this.highlights = { page, marks, scrolled: false };
      this.drawHighlights();
    },
    clearHighlights: () => {
      this.highlights = undefined;
      this.drawHighlights();
    },
  };

  setZoom(zoom: number): void {
    this.zoom = zoom;
    void this.show(this.currentPage);
  }

  destroy(): void {
    this.generation += 1;
    this.renderTask?.cancel();
    this.renderTask = undefined;
    void this.loadingTask?.destroy();
    this.loadingTask = undefined;
    this.doc = undefined;
    this.page = undefined;
    this.container?.replaceChildren();
    this.container = undefined;
    this.scroller = undefined;
    this.canvas = undefined;
    this.marks = undefined;
    this.viewport = undefined;
    this.highlights = undefined;
    this.pageTexts.clear();
    this.relocateListeners.clear();
    this.errorListeners.clear();
    this.tapListeners.clear();
    this.turnListeners.clear();
  }

  private async *find(query: string, signal: AbortSignal): AsyncGenerator<SearchResult> {
    const { doc } = this;
    if (!doc) return;
    for (let page = 1; page <= doc.numPages; page++) {
      const content = await this.pageText(doc, page);
      if (signal.aborted || doc !== this.doc) return;
      const tocEntry = entryStartingAt(this.toc, page);
      for (const match of findMatches(content.text, query)) {
        if (signal.aborted) return;
        const result: SearchResult = {
          location: String(page),
          excerpt: excerptOf(content.text, match),
          fraction: doc.numPages > 1 ? (page - 1) / (doc.numPages - 1) : 0,
          page,
          ...(tocEntry ? { tocEntry } : {}),
        };
        this.matchesOf.set(result, match);
        yield result;
      }
    }
  }

  private async pageText(doc: PDFDocumentProxy, pageNumber: number): Promise<PageText> {
    const cached = this.pageTexts.get(pageNumber);
    if (cached) return cached;
    const page = await doc.getPage(pageNumber);
    const content = await page.getTextContent();
    const placed = placeText(content.items);
    this.pageTexts.set(pageNumber, placed);
    return placed;
  }

  private drawHighlights(): void {
    const { marks, viewport, highlights, scroller } = this;
    if (!marks) return;
    marks.replaceChildren();
    const text = highlights && this.pageTexts.get(highlights.page);
    if (!highlights || !text || !viewport || highlights.page !== this.currentPage) return;
    for (const { match, kind } of highlights.marks) {
      for (const box of boxesOf(text, match, viewport)) {
        const element = document.createElement('div');
        element.dataset.highlight = kind;
        element.style.cssText = `position: absolute; left: ${box.left}px; top: ${box.top}px; width: ${box.width}px; height: ${box.height}px; background: ${highlightColors[kind]}; mix-blend-mode: multiply`;
        marks.append(element);
        if (kind === 'picked' && !highlights.scrolled && scroller) {
          highlights.scrolled = true;
          const visible = box.top >= scroller.scrollTop && box.top + box.height <= scroller.scrollTop + scroller.clientHeight;
          if (!visible) scroller.scrollTop = box.top - (scroller.clientHeight - box.height) / 2;
        }
      }
    }
  }

  private listenForGestures(scroller: HTMLElement): void {
    scroller.addEventListener('click', (event) => {
      for (const listener of this.tapListeners) listener({ x: event.clientX });
    });
    let scrolledFrom = 0;
    scroller.addEventListener('touchstart', () => (scrolledFrom = scroller.scrollLeft), { passive: true });
    onSwipe(scroller, (direction) => {
      if (scroller.scrollLeft !== scrolledFrom) return;
      void (direction === 'next' ? this.next() : this.previous());
      for (const listener of this.turnListeners) listener();
    });
  }

  private isPage(page: number): boolean {
    return Number.isInteger(page) && page >= 1 && page <= (this.doc?.numPages ?? 0);
  }

  private pageAt(fraction: number, total: number): number {
    return Math.min(Math.max(Math.round(fraction * (total - 1)) + 1, 1), total);
  }

  private resolve(location: string | undefined): number {
    const page = Number(location);
    return this.isPage(page) ? page : 1;
  }

  private async show(pageNumber: number): Promise<void> {
    const { doc, scroller, canvas } = this;
    if (!doc || !scroller || !canvas) return;
    const generation = ++this.generation;
    const inFlight = this.renderTask;
    inFlight?.cancel();
    await inFlight?.promise.catch(() => undefined);
    if (this.renderTask === inFlight) this.renderTask = undefined;
    if (generation !== this.generation) return;
    if (this.highlights && this.highlights.page !== pageNumber) this.highlights = undefined;
    this.currentPage = pageNumber;
    try {
      const page = await doc.getPage(pageNumber);
      if (generation !== this.generation) return;
      if (this.page && this.page !== page) this.page.cleanup();
      this.page = page;
      const base = page.getViewport({ scale: 1 });
      const fitWidth = (scroller.clientWidth || base.width) / base.width;
      const viewport = page.getViewport({ scale: fitWidth * this.zoom });
      const ratio = window.devicePixelRatio || 1;
      canvas.width = Math.floor(viewport.width * ratio);
      canvas.height = Math.floor(viewport.height * ratio);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;
      const task = page.render({ canvas, viewport, transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0] });
      this.renderTask = task;
      await task.promise;
      if (generation !== this.generation) return;
      this.renderTask = undefined;
      this.viewport = viewport;
      scroller.scrollTop = 0;
      this.drawHighlights();
      this.emitRelocation(pageNumber, doc.numPages);
    } catch (error) {
      if (generation !== this.generation || error instanceof pdfjs.RenderingCancelledException) return;
      for (const listener of this.errorListeners) listener(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private emitRelocation(page: number, total: number): void {
    const tocEntry = entryStartingAt(this.toc, page);
    const relocation: Relocation = {
      location: String(page),
      fraction: total > 1 ? (page - 1) / (total - 1) : 0,
      page: { current: page, total },
      ...(tocEntry ? { tocEntry } : {}),
    };
    for (const listener of this.relocateListeners) listener(relocation);
  }
}

function placeText(items: ContentItem[]): PageText {
  let text = '';
  const pieces: PlacedText[] = [];
  for (const item of items) {
    if (!('str' in item)) continue;
    pieces.push({ start: text.length, end: text.length + item.str.length, transform: item.transform as number[], width: item.width });
    text += item.str;
    if (item.hasEOL) text += ' ';
  }
  return { text, pieces };
}

function boxesOf({ pieces }: PageText, { start, end }: TextMatch, viewport: PageViewport) {
  return pieces.flatMap((piece) => {
    const from = Math.max(start, piece.start);
    const to = Math.min(end, piece.end);
    if (from >= to) return [];
    const [, , c = 0, d = 0, x = 0, y = 0] = pdfjs.Util.transform(viewport.transform, piece.transform);
    const height = Math.hypot(c, d);
    const width = piece.width * viewport.scale;
    const length = piece.end - piece.start;
    const left = x + (width * (from - piece.start)) / length;
    return [{ left, top: y - height, width: (width * (to - from)) / length, height }];
  });
}

async function mapOutline(doc: PDFDocumentProxy, items: OutlineItem[]): Promise<TocEntry[]> {
  const entries = await Promise.all(
    items.map(async (item): Promise<TocEntry[]> => {
      const page = await pageOf(doc, item.dest);
      if (page === undefined) return [];
      const children = await mapOutline(doc, item.items ?? []);
      return [{ label: item.title, location: String(page), ...(children.length > 0 ? { children } : {}) }];
    }),
  );
  return entries.flat();
}

async function pageOf(doc: PDFDocumentProxy, dest: OutlineItem['dest']): Promise<number | undefined> {
  const explicit = typeof dest === 'string' ? await doc.getDestination(dest) : dest;
  const target: unknown = explicit?.[0];
  if (typeof target === 'number') return Number.isInteger(target) ? target + 1 : undefined;
  if (!target || typeof target !== 'object' || !('num' in target) || typeof target.num !== 'number') return undefined;
  try {
    return (await doc.getPageIndex(target as { num: number; gen: number })) + 1;
  } catch {
    return undefined;
  }
}

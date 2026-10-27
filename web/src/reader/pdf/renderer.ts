import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { PDFDocumentLoadingTask, PDFDocumentProxy, PDFPageProxy, RenderTask } from 'pdfjs-dist/legacy/build/pdf.mjs';
import workerSrc from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import type { BookRenderer, Relocation, TocEntry } from '../renderer.ts';
import { entryStartingAt } from '../toc.ts';

pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

const wasmUrl = `${import.meta.env.BASE_URL}pdfjs/wasm/`;

type OutlineItem = NonNullable<Awaited<ReturnType<PDFDocumentProxy['getOutline']>>>[number];

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
  private page: PDFPageProxy | undefined;
  private currentPage = 1;
  private zoom = 1;
  private renderTask: RenderTask | undefined;
  private generation = 0;
  private readonly relocateListeners = new Set<(relocation: Relocation) => void>();
  private readonly errorListeners = new Set<(error: Error) => void>();

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
    this.scroller.append(this.canvas);
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

  async goTo(location: string): Promise<void> {
    const page = Number(location);
    if (this.isPage(page)) await this.show(page);
  }

  async next(): Promise<void> {
    if (this.doc && this.currentPage < this.doc.numPages) await this.show(this.currentPage + 1);
  }

  async previous(): Promise<void> {
    if (this.currentPage > 1) await this.show(this.currentPage - 1);
  }

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
    this.relocateListeners.clear();
    this.errorListeners.clear();
  }

  private isPage(page: number): boolean {
    return Number.isInteger(page) && page >= 1 && page <= (this.doc?.numPages ?? 0);
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
      scroller.scrollTop = 0;
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

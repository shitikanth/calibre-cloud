import type { BookRenderer, ReaderStyles, Relocation, Renderers, TocEntry } from '../reader/renderer.ts';
import { entryStartingAt } from '../reader/toc.ts';

export type RendererCall =
  | { op: 'goTo'; location: string }
  | { op: 'next' }
  | { op: 'previous' }
  | { op: 'setStyles'; styles: ReaderStyles }
  | { op: 'setZoom'; zoom: number }
  | { op: 'destroy' };

export type FakeRendererOptions = { pages?: boolean };

export class FakeRenderer implements BookRenderer {
  toc: TocEntry[] = [];
  failOpen = false;
  readonly calls: RendererCall[] = [];
  opened: { blob: Blob; location: string | undefined } | undefined;
  private readonly reportsPages: boolean;
  private lines: string[] = [];
  private index = 0;
  private container: HTMLElement | undefined;
  private readonly relocateListeners = new Set<(relocation: Relocation) => void>();
  private readonly errorListeners = new Set<(error: Error) => void>();

  constructor({ pages = false }: FakeRendererOptions = {}) {
    this.reportsPages = pages;
  }

  async open(blob: Blob, container: HTMLElement, { location }: { location?: string }): Promise<void> {
    if (this.failOpen) throw new Error('Not a book');
    this.lines = (await blob.text()).split('\n');
    this.container = container;
    this.opened = { blob, location };
    this.toc = this.lines.flatMap((line, index) =>
      line.startsWith('# ') ? [{ label: line.slice(2), location: String(index + 1) }] : [],
    );
    this.show(this.resolve(location));
  }

  onRelocate(listener: (relocation: Relocation) => void): () => void {
    this.relocateListeners.add(listener);
    return () => this.relocateListeners.delete(listener);
  }

  onRenderError(listener: (error: Error) => void): () => void {
    this.errorListeners.add(listener);
    return () => this.errorListeners.delete(listener);
  }

  async goTo(location: string): Promise<void> {
    this.calls.push({ op: 'goTo', location });
    this.show(this.resolve(location));
  }

  async next(): Promise<void> {
    this.calls.push({ op: 'next' });
    this.show(Math.min(this.index + 1, this.lines.length - 1));
  }

  async previous(): Promise<void> {
    this.calls.push({ op: 'previous' });
    this.show(Math.max(this.index - 1, 0));
  }

  setStyles(styles: ReaderStyles): void {
    this.calls.push({ op: 'setStyles', styles });
  }

  setZoom(zoom: number): void {
    this.calls.push({ op: 'setZoom', zoom });
  }

  destroy(): void {
    this.calls.push({ op: 'destroy' });
    this.container?.replaceChildren();
    this.container = undefined;
    this.relocateListeners.clear();
    this.errorListeners.clear();
  }

  emitRelocation(relocation: Relocation): void {
    for (const listener of this.relocateListeners) listener(relocation);
  }

  emitRenderError(error: Error): void {
    for (const listener of this.errorListeners) listener(error);
  }

  private resolve(location: string | undefined): number {
    const index = Number(location) - 1;
    return Number.isInteger(index) && index >= 0 && index < this.lines.length ? index : 0;
  }

  private show(index: number): void {
    this.index = index;
    if (this.container) this.container.textContent = this.lines[index] ?? '';
    const total = this.lines.length;
    const tocEntry = entryStartingAt(this.toc, index + 1);
    const relocation: Relocation = {
      location: String(index + 1),
      fraction: total > 1 ? index / (total - 1) : 0,
      ...(this.reportsPages ? { page: { current: index + 1, total } } : {}),
      ...(tocEntry ? { tocEntry } : {}),
    };
    this.emitRelocation(relocation);
  }
}

export type FakeRenderers = {
  renderers: Renderers;
  instances: FakeRenderer[];
  readonly latest: FakeRenderer;
  failCreate: Error | undefined;
};

export function fakeRenderers(
  formats: string[],
  setup: (renderer: FakeRenderer, format: string) => void = () => {},
): FakeRenderers {
  const instances: FakeRenderer[] = [];
  const renderers = Object.fromEntries(
    formats.map((format) => [
      format,
      async () => {
        if (fake.failCreate) throw fake.failCreate;
        const renderer = new FakeRenderer({ pages: format === 'PDF' });
        setup(renderer, format);
        instances.push(renderer);
        return renderer;
      },
    ]),
  );
  const fake: FakeRenderers = {
    renderers,
    instances,
    failCreate: undefined,
    get latest() {
      const renderer = instances.at(-1);
      if (!renderer) throw new Error('No renderer has been created yet');
      return renderer;
    },
  };
  return fake;
}

export type TocEntry = { label: string; location: string; children?: TocEntry[] };

export type Relocation = { location: string; fraction: number; page?: { current: number; total: number } };

export type ReaderTheme = 'light' | 'sepia' | 'dark';

export type ReaderStyles = { fontSize: number; theme: ReaderTheme };

export interface BookRenderer {
  readonly toc: TocEntry[];
  open(blob: Blob, container: HTMLElement, options: { location?: string }): Promise<void>;
  onRelocate(listener: (relocation: Relocation) => void): () => void;
  onRenderError(listener: (error: Error) => void): () => void;
  goTo(location: string): Promise<void>;
  next(): Promise<void>;
  previous(): Promise<void>;
  setStyles?(styles: ReaderStyles): void;
  setZoom?(zoom: number): void;
  destroy(): void;
}

export type RendererFactory = () => Promise<BookRenderer>;

export type Renderers = Readonly<Partial<Record<string, RendererFactory>>>;

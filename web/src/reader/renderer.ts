export type TocEntry = { label: string; location: string; children?: TocEntry[] };

export type Relocation = { location: string; fraction: number; page?: { current: number; total: number }; tocEntry?: TocEntry };

export type ReaderTheme = 'light' | 'sepia' | 'dark';

export type ReaderStyles = { fontSize: number; theme: ReaderTheme };

export interface BookRenderer {
  readonly toc: TocEntry[];
  open(blob: Blob, container: HTMLElement, options: { location?: string }): Promise<void>;
  onRelocate(listener: (relocation: Relocation) => void): () => void;
  onRenderError(listener: (error: Error) => void): () => void;
  onExternalLink(listener: (url: string) => void): () => void;
  // A tap or click on the page that is not on a link and does not end a text selection.
  onTap(listener: () => void): () => void;
  // The page turned from input inside the book (a key or a swipe), not from a call on this interface.
  onTurn(listener: () => void): () => void;
  goTo(location: string): Promise<void>;
  goToFraction(fraction: number): Promise<void>;
  tocEntryAt(fraction: number): TocEntry | undefined;
  next(): Promise<void>;
  previous(): Promise<void>;
  // Read once open resolves: a renderer can drop a capability when the book turns out to be fixed-layout.
  setStyles?: ((styles: ReaderStyles) => void) | undefined;
  setZoom?(zoom: number): void;
  destroy(): void;
}

export type RendererFactory = () => Promise<BookRenderer>;

export type Renderers = Readonly<Partial<Record<string, RendererFactory>>>;

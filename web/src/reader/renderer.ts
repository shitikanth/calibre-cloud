export type TocEntry = { label: string; location: string; children?: TocEntry[] };

export type Relocation = { location: string; fraction: number; page?: { current: number; total: number }; tocEntry?: TocEntry };

export type Tap = { x: number };

export type ReaderTheme = 'light' | 'sepia' | 'dark';

export type ReaderStyles = { fontSize: number; theme: ReaderTheme };

export type SearchExcerpt = { before: string; match: string; after: string };

export type SearchResult = { location: string; excerpt: SearchExcerpt; fraction: number; page?: number; tocEntry?: TocEntry };

export interface BookSearch {
  // Matching ignores case and diacritics. Results come in book order, and stop once the signal aborts.
  find(query: string, signal: AbortSignal): AsyncIterable<SearchResult>;
  // Call once goTo(result.location) resolves. Those of the other matches that show on the same page are drawn fainter.
  highlight(result: SearchResult, matches: readonly SearchResult[]): void;
  clearHighlights(): void;
}

export interface BookRenderer {
  readonly toc: TocEntry[];
  // Key and pointer presses inside the book must reach the container, as if the book were part of the page.
  open(blob: Blob, container: HTMLElement, options: { location?: string }): Promise<void>;
  onRelocate(listener: (relocation: Relocation) => void): () => void;
  onRenderError(listener: (error: Error) => void): () => void;
  onExternalLink(listener: (url: string) => void): () => void;
  // A tap or click on the page that is not on a link and does not end a text selection. x is in the page's viewport.
  onTap(listener: (tap: Tap) => void): () => void;
  // The page turned from a swipe inside the book, not from a call on this interface.
  onTurn(listener: () => void): () => void;
  goTo(location: string): Promise<void>;
  goToFraction(fraction: number): Promise<void>;
  tocEntryAt(fraction: number): TocEntry | undefined;
  next(): Promise<void>;
  previous(): Promise<void>;
  // Read once open resolves: a renderer can drop a capability when the book turns out to be fixed-layout.
  setStyles?: ((styles: ReaderStyles) => void) | undefined;
  setZoom?(zoom: number): void;
  search?: BookSearch | undefined;
  destroy(): void;
}

export type RendererFactory = () => Promise<BookRenderer>;

export type Renderers = Readonly<Partial<Record<string, RendererFactory>>>;

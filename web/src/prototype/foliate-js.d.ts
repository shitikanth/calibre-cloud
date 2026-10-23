// PROTOTYPE: minimal typings for foliate-js, which ships none.
declare module 'foliate-js/view.js' {
  export type TocItem = { label: string; href: string; subitems?: TocItem[] };
  export type Location = {
    cfi: string;
    fraction: number;
    section?: { current: number; total: number };
    tocItem?: TocItem;
  };
  export interface FoliateView extends HTMLElement {
    book: { toc?: TocItem[]; metadata?: { title?: unknown } };
    renderer: HTMLElement & { setStyles?: (css: string) => void };
    lastLocation?: Location;
    open(book: Blob | string): Promise<void>;
    close(): void;
    goTo(target: string | number): Promise<unknown>;
    prev(): Promise<void>;
    next(): Promise<void>;
    init(options: { lastLocation?: string; showTextStart?: boolean }): Promise<void>;
  }
}

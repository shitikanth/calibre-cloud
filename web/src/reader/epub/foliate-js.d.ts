declare module 'foliate-js/view.js' {
  export type TocItem = { label: string; href: string; subitems?: TocItem[] };

  export type Location = { cfi: string; fraction: number };

  export type ResourceLoad = { type: string; isScript: boolean; allow: boolean | Promise<boolean> };

  export type ResourceData = {
    readonly name: string;
    data: string | Blob | Promise<string | Blob>;
    type: string;
  };

  export type Book = {
    toc?: TocItem[];
    sections: unknown[];
    transformTarget?: EventTarget;
  };

  export type NavigationTarget = { index: number; anchor?: unknown };

  export interface FoliateView extends HTMLElement {
    book: Book;
    renderer: HTMLElement & { setStyles(css: string): void };
    open(book: File): Promise<void>;
    close(): void;
    init(options: { lastLocation?: string; showTextStart?: boolean }): Promise<void>;
    resolveNavigation(target: string | number): NavigationTarget | null | undefined;
    goTo(target: string | number): Promise<NavigationTarget | undefined>;
    prev(): Promise<void>;
    next(): Promise<void>;
  }
}

declare module 'foliate-js/epubcfi.js' {
  export function collapse(cfi: string, toEnd?: boolean): string;
}

declare module 'foliate-js/view.js' {
  export type TocItem = { label: string; href: string; subitems?: TocItem[] };

  export type Location = { cfi: string; fraction: number; tocItem?: TocItem | null };

  export type ExternalLink = { a: HTMLAnchorElement; href_: string };

  export type ResourceLoad = { type: string; isScript: boolean; allow: boolean | Promise<boolean> };

  export type ResourceData = {
    readonly name?: string;
    data: string | Blob | Promise<string | Blob>;
    type: string;
  };

  export type Book = {
    toc?: TocItem[];
    sections: unknown[];
    transformTarget?: EventTarget;
    destroy?(): void;
  };

  export type NavigationTarget = { index: number };

  export interface FoliateView extends HTMLElement {
    book: Book;
    renderer: HTMLElement & { setStyles?(css: string): void };
    open(book: File): Promise<void>;
    close(): void;
    init(options: { lastLocation?: string; showTextStart?: boolean }): Promise<void>;
    resolveNavigation(target: string | number): NavigationTarget | Promise<NavigationTarget | null> | null | undefined;
    goTo(target: string | number): Promise<NavigationTarget | undefined>;
    goToFraction(fraction: number): Promise<void>;
    getSectionFractions(): number[];
    prev(): Promise<void>;
    next(): Promise<void>;
  }
}

declare module 'foliate-js/epubcfi.js' {
  export function collapse(cfi: string, toEnd?: boolean): string;
}

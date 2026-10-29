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

  export type Section = { createDocument?: () => Document | Promise<Document> };

  export type Book = {
    toc?: TocItem[];
    sections: Section[];
    transformTarget?: EventTarget;
    destroy?(): void;
  };

  export type NavigationTarget = { index: number; anchor?: (doc: Document) => Range | Element | null };

  export type Overlayer = {
    readonly element: SVGSVGElement;
    add(key: string, range: Range, draw: (rects: DOMRectList) => SVGElement): void;
    remove(key: string): void;
  };

  export type Contents = { doc: Document; index?: number; overlayer?: Overlayer };

  export interface FoliateView extends HTMLElement {
    book: Book;
    renderer: HTMLElement & { setStyles?(css: string): void; getContents(): Contents[] };
    language?: { canonical?: string };
    open(book: File): Promise<void>;
    close(): void;
    init(options: { lastLocation?: string; showTextStart?: boolean }): Promise<void>;
    resolveNavigation(target: string | number): NavigationTarget | Promise<NavigationTarget | null> | null | undefined;
    goTo(target: string | number): Promise<NavigationTarget | undefined>;
    goToFraction(fraction: number): Promise<void>;
    getSectionFractions(): number[];
    getCFI(index: number, range: Range): string;
    prev(): Promise<void>;
    next(): Promise<void>;
  }
}

declare module 'foliate-js/epubcfi.js' {
  export function collapse(cfi: string, toEnd?: boolean): string;
}

declare module 'foliate-js/search.js' {
  export type Excerpt = { pre: string; match: string; post: string };

  export type MatcherOptions = { defaultLocale?: string | undefined; matchCase?: boolean; matchDiacritics?: boolean; matchWholeWords?: boolean };

  export function searchMatcher(
    textWalker: unknown,
    options: MatcherOptions,
  ): (doc: Document, query: string) => Iterable<{ range: Range; excerpt: Excerpt }>;
}

declare module 'foliate-js/text-walker.js' {
  export const textWalker: unknown;
}

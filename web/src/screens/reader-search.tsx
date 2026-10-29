import { useCallback, useEffect, useRef, useState } from 'react';
import type { BookRenderer, BookSearch, SearchResult, TocEntry } from '../reader/renderer.ts';
import { panelClass, ReaderPopover, scrollToCurrent, type PopoverPlacement } from './reader-popover.tsx';

const SETTLE_MS = 250;

const searchIcon = (
  <>
    <circle cx="11" cy="11" r="7" />
    <path d="M20 20l-4-4" />
  </>
);

export type SearchState = { query: string; results: SearchResult[]; searching: boolean; picked: SearchResult | undefined };

const blank: SearchState = { query: '', results: [], searching: false, picked: undefined };

type OwnedState = SearchState & { owner: BookSearch | undefined };

export type BookSearchControl = { state: SearchState; change: (query: string) => void; pick: (result: SearchResult) => void };

export function useBookSearch(search: BookSearch | undefined): BookSearchControl {
  const [owned, setState] = useState<OwnedState>({ ...blank, owner: undefined });
  const running = useRef<AbortController | undefined>(undefined);
  const state = owned.owner === search ? owned : blank;

  useEffect(() => {
    return () => {
      running.current?.abort();
      running.current = undefined;
    };
  }, [search]);

  const change = useCallback(
    (query: string) => {
      running.current?.abort();
      const controller = new AbortController();
      running.current = controller;
      const { signal } = controller;
      const wanted = search && query.trim() !== '';
      setState({ query, results: [], searching: !!wanted, picked: undefined, owner: search });
      if (!wanted) return;
      void (async () => {
        await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
        if (signal.aborted) return;
        const found: SearchResult[] = [];
        let frame: number | undefined;
        const flush = () => {
          frame = undefined;
          if (!signal.aborted) setState((current) => ({ ...current, results: found.slice() }));
        };
        try {
          for await (const result of search.find(query, signal)) {
            if (signal.aborted) return;
            found.push(result);
            frame ??= requestAnimationFrame(flush);
          }
        } catch {
          // A search that fails part-way keeps what it found.
        }
        if (frame !== undefined) cancelAnimationFrame(frame);
        if (!signal.aborted) setState((current) => ({ ...current, results: found, searching: false }));
      })();
    },
    [search],
  );

  const pick = useCallback((picked: SearchResult) => setState((current) => ({ ...current, picked })), []);

  return { state, change, pick };
}

export type Highlights = { show: (renderer: BookRenderer, result: SearchResult, matches: readonly SearchResult[]) => void; clear: () => void };

function createHighlights(): Highlights {
  let shownOn: BookRenderer | undefined;
  let generation = 0;
  return {
    show(renderer, result, matches) {
      const current = ++generation;
      void renderer.goTo(result.location).then(() => {
        if (current !== generation) return;
        renderer.search?.highlight(result, matches);
        shownOn = renderer;
      });
    },
    clear() {
      generation += 1;
      shownOn?.search?.clearHighlights();
      shownOn = undefined;
    },
  };
}

export function useHighlights(): Highlights {
  const [highlights] = useState(createHighlights);
  return highlights;
}

type SearchToolProps = { control: BookSearchControl; placement: PopoverPlacement; onPick: (result: SearchResult) => void };

export function SearchTool({ control, placement, onPick }: SearchToolProps) {
  return (
    <ReaderPopover label="Search" icon={searchIcon} placement={placement}>
      {(close) => (
        <SearchPanel
          control={control}
          pick={(result) => {
            close();
            control.pick(result);
            onPick(result);
          }}
        />
      )}
    </ReaderPopover>
  );
}

type Group = { entry: TocEntry | undefined; results: SearchResult[] };

function grouped(results: SearchResult[]): Group[] {
  const groups: Group[] = [];
  for (const result of results) {
    const last = groups.at(-1);
    if (last && last.entry === result.tocEntry) last.results.push(result);
    else groups.push({ entry: result.tocEntry, results: [result] });
  }
  return groups;
}

function positionOf({ page, fraction }: SearchResult): string {
  return page === undefined ? `${Math.round(fraction * 100)}%` : `page ${page}`;
}

function countLabel({ query, results, searching }: SearchState): string {
  if (query.trim() === '') return '';
  if (results.length === 0) return searching ? 'Searching…' : 'No matches';
  const count = `${results.length.toLocaleString()} ${results.length === 1 ? 'match' : 'matches'}`;
  return searching ? `${count}…` : count;
}

function SearchPanel({ control, pick }: { control: BookSearchControl; pick: (result: SearchResult) => void }) {
  const { state, change } = control;
  const list = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    input.current?.focus();
    scrollToCurrent(list.current);
  }, []);
  const count = countLabel(state);

  return (
    <div
      role="search"
      aria-label="Search in book"
      className={`${panelClass} flex flex-col text-sm`}
    >
      <div className="m-3 flex h-10 items-center gap-2 rounded-md border border-(--reader-line) px-2.5 focus-within:outline-2 focus-within:outline-(--reader-muted)">
        <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4 shrink-0 fill-none stroke-(--reader-muted) stroke-2">
          {searchIcon}
        </svg>
        <input
          ref={input}
          type="search"
          aria-label="Search in book"
          value={state.query}
          onChange={(event) => change(event.target.value)}
          className="min-w-0 flex-1 bg-transparent outline-none [&::-webkit-search-cancel-button]:appearance-none"
        />
        {state.query !== '' && (
          <button
            type="button"
            aria-label="Clear search"
            className="-mr-1 flex size-8 items-center justify-center rounded text-(--reader-muted) hover:bg-(--reader-hover)"
            onClick={() => {
              change('');
              input.current?.focus();
            }}
          >
            ✕
          </button>
        )}
      </div>
      <p role="status" className={`px-4 text-xs text-(--reader-muted) ${count ? 'pb-1.5' : ''}`}>
        {count}
      </p>
      {state.results.length > 0 && (
        <div ref={list} className="min-h-0 overflow-y-auto border-t border-(--reader-line) pb-1">
          {grouped(state.results).map((group, index) => (
            <section key={index}>
              {group.entry && (
                <h3 className="px-4 pt-2.5 pb-1 text-xs font-semibold tracking-wide text-(--reader-muted) uppercase">{group.entry.label}</h3>
              )}
              <ul>
                {group.results.map((result, item) => (
                  <li key={item}>
                    <button
                      type="button"
                      aria-current={result === state.picked ? 'true' : undefined}
                      className="flex min-h-11 w-full gap-3 px-4 py-2 text-left hover:bg-(--reader-hover) aria-[current=true]:bg-(--reader-hover)"
                      onClick={() => pick(result)}
                    >
                      <span className="flex-1 leading-snug">
                        {result.excerpt.before}
                        <strong className="font-bold">{result.excerpt.match}</strong>
                        {result.excerpt.after}
                      </span>
                      <span className="pt-0.5 text-xs whitespace-nowrap text-(--reader-muted) tabular-nums">{positionOf(result)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

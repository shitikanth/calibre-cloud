import { useEffect, useRef } from 'react';
import type { BookRenderer, TocEntry } from '../reader/renderer.ts';
import { panelClass, ReaderPopover, type PopoverPlacement } from './reader-popover.tsx';

type TocToolProps = { renderer: BookRenderer; current: TocEntry | undefined; placement: PopoverPlacement };

export function TocTool({ renderer, current, placement }: TocToolProps) {
  return (
    <ReaderPopover label="Table of contents" icon={<path d="M4 6h16M4 12h16M4 18h10" />} placement={placement}>
      {(close) => (
        <TocPanel
          entries={renderer.toc}
          current={current}
          jump={(entry) => {
            close();
            void renderer.goTo(entry.location);
          }}
        />
      )}
    </ReaderPopover>
  );
}

type TocProps = { entries: TocEntry[]; current: TocEntry | undefined; jump: (entry: TocEntry) => void };

function TocPanel({ entries, current, jump }: TocProps) {
  const nav = useRef<HTMLElement>(null);
  useEffect(() => {
    const panel = nav.current;
    const marked = panel?.querySelector<HTMLElement>('[aria-current="true"]');
    if (!panel || !marked) return;
    const offset = marked.getBoundingClientRect().top - panel.getBoundingClientRect().top + panel.scrollTop;
    panel.scrollTop = offset - (panel.clientHeight - marked.offsetHeight) / 2;
  }, [current]);

  return (
    <nav ref={nav} aria-label="Table of contents" className={`${panelClass} py-1`}>
      {entries.length === 0 ? (
        <p className="px-4 py-2 text-sm text-(--reader-muted)">No table of contents</p>
      ) : (
        <TocList entries={entries} current={current} jump={jump} />
      )}
    </nav>
  );
}

function TocList({ entries, current, jump }: TocProps) {
  return (
    <ul>
      {entries.map((entry, index) => (
        <li key={`${entry.location}-${index}`}>
          <button
            type="button"
            aria-current={entry === current ? 'true' : undefined}
            className="flex min-h-11 w-full items-center px-4 py-2 text-left text-sm hover:bg-(--reader-hover) aria-[current=true]:bg-(--reader-hover) aria-[current=true]:font-semibold"
            onClick={() => jump(entry)}
          >
            {entry.label}
          </button>
          {entry.children && entry.children.length > 0 && (
            <div className="pl-4">
              <TocList entries={entry.children} current={current} jump={jump} />
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

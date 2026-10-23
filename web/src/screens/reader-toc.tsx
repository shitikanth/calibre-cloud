import { useRef, useState } from 'react';
import type { BookRenderer, TocEntry } from '../reader/renderer.ts';
import { useDismiss } from './use-dismiss.ts';

export const toolButtonClass = 'rounded p-2 hover:bg-(--reader-hover)';
export const panelClass = 'absolute right-0 z-20 mt-1 max-h-[70dvh] w-72 overflow-y-auto rounded border border-(--reader-line) bg-(--reader-bg) text-(--reader-fg) shadow-lg';

export function TocTool({ renderer }: { renderer: BookRenderer }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useDismiss(open, () => setOpen(false), root);

  const jump = (entry: TocEntry) => {
    setOpen(false);
    void renderer.goTo(entry.location);
  };

  return (
    <div ref={root} className="relative shrink-0">
      <button
        type="button"
        aria-label="Table of contents"
        aria-expanded={open}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
        className={toolButtonClass}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5 fill-none stroke-current stroke-2">
          <path d="M4 6h16M4 12h16M4 18h10" />
        </svg>
      </button>
      {open && (
        <nav aria-label="Table of contents" className={`${panelClass} py-1`}>
          {renderer.toc.length === 0 ? (
            <p className="px-4 py-2 text-sm text-(--reader-muted)">No table of contents</p>
          ) : (
            <TocList entries={renderer.toc} jump={jump} />
          )}
        </nav>
      )}
    </div>
  );
}

function TocList({ entries, jump }: { entries: TocEntry[]; jump: (entry: TocEntry) => void }) {
  return (
    <ul>
      {entries.map((entry, index) => (
        <li key={`${entry.location}-${index}`}>
          <button
            type="button"
            className="block w-full px-4 py-2 text-left text-sm hover:bg-(--reader-hover)"
            onClick={() => jump(entry)}
          >
            {entry.label}
          </button>
          {entry.children && entry.children.length > 0 && (
            <div className="pl-4">
              <TocList entries={entry.children} jump={jump} />
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

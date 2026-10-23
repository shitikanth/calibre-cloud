import type { BookRenderer, TocEntry } from '../reader/renderer.ts';
import { panelClass, ReaderPopover } from './reader-popover.tsx';

export function TocTool({ renderer }: { renderer: BookRenderer }) {
  return (
    <ReaderPopover label="Table of contents" icon={<path d="M4 6h16M4 12h16M4 18h10" />}>
      {(close) => (
        <nav aria-label="Table of contents" className={`${panelClass} py-1`}>
          {renderer.toc.length === 0 ? (
            <p className="px-4 py-2 text-sm text-(--reader-muted)">No table of contents</p>
          ) : (
            <TocList
              entries={renderer.toc}
              jump={(entry) => {
                close();
                void renderer.goTo(entry.location);
              }}
            />
          )}
        </nav>
      )}
    </ReaderPopover>
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

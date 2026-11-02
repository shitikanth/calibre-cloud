import type { TocEntry } from './renderer.ts';

export function entryStartingAt(toc: TocEntry[], position: number): TocEntry | undefined {
  let current: { entry: TocEntry; start: number } | undefined;
  const visit = (entries: TocEntry[]) => {
    for (const entry of entries) {
      const start = Number(entry.location);
      if (start <= position && start >= (current?.start ?? -Infinity)) current = { entry, start };
      visit(entry.children ?? []);
    }
  };
  visit(toc);
  return current?.entry;
}

function flatten(entries: TocEntry[]): TocEntry[] {
  return entries.flatMap((entry) => [entry, ...flatten(entry.children ?? [])]);
}

export function adjacentEntry(toc: TocEntry[], current: TocEntry | undefined, direction: 'next' | 'previous'): TocEntry | undefined {
  const entries = flatten(toc);
  const step = direction === 'next' ? 1 : -1;
  for (let index = (current ? entries.indexOf(current) : -1) + step; index >= 0 && index < entries.length; index += step) {
    const entry = entries[index];
    if (entry && entry.location !== current?.location) return entry;
  }
  return undefined;
}

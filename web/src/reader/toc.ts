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

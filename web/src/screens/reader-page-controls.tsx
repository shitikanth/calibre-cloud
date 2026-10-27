import { useEffect, useRef, useState } from 'react';
import type { BookRenderer, Relocation } from '../reader/renderer.ts';

type PageControlsProps = { renderer: BookRenderer; relocation: Relocation | undefined };

export function PageControls({ renderer, relocation }: PageControlsProps) {
  const bar = useRef<HTMLInputElement>(null);
  const [dragged, setDragged] = useState<number | undefined>(undefined);
  const page = relocation?.page;
  const min = page ? 1 : 0;
  const max = page ? page.total : 100;
  const value = dragged ?? (page ? page.current : Math.round((relocation?.fraction ?? 0) * 100));

  // React's onChange fires on every input event while dragging; the native change event fires once, on release.
  useEffect(() => {
    const element = bar.current;
    if (!element) return;
    const jump = () => {
      const fraction = fractionOf(Number(element.value), Number(element.min), Number(element.max));
      void renderer.goToFraction(fraction).finally(() => setDragged(undefined));
    };
    element.addEventListener('change', jump);
    return () => element.removeEventListener('change', jump);
  }, [renderer]);

  const readout = () => {
    if (dragged === undefined) return progressText(relocation);
    const { page: target, tocEntry } = renderer.positionAt(fractionOf(dragged, min, max));
    const place = target ? `page ${target.current} of ${target.total}` : `${dragged}%`;
    return tocEntry ? `${tocEntry.label} · ${place}` : place;
  };

  return (
    <nav aria-label="Pages" className="flex flex-wrap items-center justify-between gap-x-2 border-t border-(--reader-line) px-2 py-1">
      <input
        ref={bar}
        type="range"
        aria-label="Position in book"
        className="h-11 w-full cursor-pointer accent-(--reader-fg)"
        min={min}
        max={max}
        step={1}
        value={value}
        aria-valuetext={page ? `Page ${value} of ${page.total}` : `${value}%`}
        onChange={(event) => setDragged(Number(event.target.value))}
      />
      <button type="button" className="min-h-11 rounded px-3 py-1 hover:bg-(--reader-hover)" onClick={() => void renderer.previous()}>
        Previous
      </button>
      <span className="text-sm text-(--reader-muted)">{readout()}</span>
      <button type="button" className="min-h-11 rounded px-3 py-1 hover:bg-(--reader-hover)" onClick={() => void renderer.next()}>
        Next
      </button>
    </nav>
  );
}

function fractionOf(value: number, min: number, max: number): number {
  return max > min ? (value - min) / (max - min) : 0;
}

function progressText(relocation: Relocation | undefined): string {
  if (!relocation) return '';
  if (relocation.page) return `page ${relocation.page.current} of ${relocation.page.total}`;
  return `${Math.round(relocation.fraction * 100)}%`;
}

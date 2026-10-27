import { useEffect, useRef, useState } from 'react';
import type { BookRenderer, Relocation } from '../reader/renderer.ts';

type PageControlsProps = { renderer: BookRenderer; relocation: Relocation | undefined };

type Scale = { min: number; max: number; current: number; label: (value: number) => string };

export function PageControls({ renderer, relocation }: PageControlsProps) {
  const bar = useRef<HTMLInputElement>(null);
  const [draggedTo, setDraggedTo] = useState<number | undefined>(undefined);
  const scale = scaleOf(relocation);
  const { min, max } = scale;
  const value = draggedTo ?? scale.current;

  // React's onChange fires on every input event while dragging; the native change event fires once, on release.
  useEffect(() => {
    const element = bar.current;
    if (!element) return;
    const jump = () => {
      void renderer.goToFraction(fractionOf(Number(element.value), min, max)).finally(() => setDraggedTo(undefined));
    };
    element.addEventListener('change', jump);
    return () => element.removeEventListener('change', jump);
  }, [renderer, min, max]);

  const chapter = draggedTo === undefined ? undefined : renderer.tocEntryAt(fractionOf(draggedTo, min, max));
  const readout = relocation ? scale.label(value) : '';

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
        aria-valuetext={scale.label(value)}
        onChange={(event) => {
          const next = Number(event.target.value);
          setDraggedTo(next === scale.current ? undefined : next);
        }}
      />
      <button type="button" className="min-h-11 rounded px-3 py-1 hover:bg-(--reader-hover)" onClick={() => void renderer.previous()}>
        Previous
      </button>
      <span className="text-sm text-(--reader-muted)">{chapter ? `${chapter.label} · ${readout}` : readout}</span>
      <button type="button" className="min-h-11 rounded px-3 py-1 hover:bg-(--reader-hover)" onClick={() => void renderer.next()}>
        Next
      </button>
    </nav>
  );
}

function scaleOf(relocation: Relocation | undefined): Scale {
  const page = relocation?.page;
  if (page) return { min: 1, max: page.total, current: page.current, label: (value) => `page ${value} of ${page.total}` };
  return { min: 0, max: 100, current: Math.round((relocation?.fraction ?? 0) * 100), label: (value) => `${value}%` };
}

function fractionOf(value: number, min: number, max: number): number {
  return max > min ? (value - min) / (max - min) : 0;
}

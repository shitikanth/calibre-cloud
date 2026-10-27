import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { BookRenderer, Relocation } from '../reader/renderer.ts';

const thumb = 16;

type Scale = { min: number; max: number; current: number; label: (value: number) => string };

export function positionLabel(relocation: Relocation | undefined): string {
  if (!relocation) return '';
  const scale = scaleOf(relocation);
  return scale.label(scale.current);
}

export function placeLabel(relocation: Relocation | undefined): string {
  const chapter = relocation?.tocEntry?.label;
  const position = positionLabel(relocation);
  return chapter ? `${chapter} · ${position}` : position;
}

export function SeekBar({ renderer, relocation }: { renderer: BookRenderer; relocation: Relocation | undefined }) {
  const bar = useRef<HTMLInputElement>(null);
  const [draggedTo, setDraggedTo] = useState<number | undefined>(undefined);
  const [width, setWidth] = useState(0);
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

  useEffect(() => {
    const element = bar.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setWidth(element.clientWidth));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const fraction = fractionOf(value, min, max);
  const style = { '--thumb': `${thumb}px`, '--fraction': fraction } as CSSProperties;

  return (
    <div className="relative">
      <input
        ref={bar}
        type="range"
        aria-label="Position in book"
        className="seek-bar h-11 w-full cursor-pointer"
        style={style}
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
      {draggedTo !== undefined && (
        <DragPopup x={thumb / 2 + (width - thumb) * fraction} width={width} chapter={renderer.tocEntryAt(fraction)?.label} position={scale.label(value)} />
      )}
    </div>
  );
}

type DragPopupProps = { x: number; width: number; chapter: string | undefined; position: string };

function DragPopup({ x, width, chapter, position }: DragPopupProps) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute bottom-full flex max-w-full rounded bg-(--reader-fg) px-2 py-1 text-xs whitespace-nowrap text-(--reader-bg) shadow-lg"
      style={{ left: x, transform: `translateX(clamp(${-x}px, -50%, calc(${width - x}px - 100%)))` }}
    >
      {chapter && <span className="min-w-0 truncate">{chapter}</span>}
      <span className="shrink-0 whitespace-pre">{chapter ? ` · ${position}` : position}</span>
    </div>
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

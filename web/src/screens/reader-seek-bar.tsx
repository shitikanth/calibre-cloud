import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import type { Jump } from '../reader/jumps.ts';
import type { BookRenderer, Relocation } from '../reader/renderer.ts';

const thumb = 16;

type Scale = { min: number; max: number; current: number; label: (value: number) => string };

export function positionLabel(relocation: Relocation | undefined): string {
  if (!relocation) return '';
  const scale = scaleOf(relocation);
  return scale.label(scale.current);
}

export function whereYouAreLabel(relocation: Relocation | undefined): string {
  const chapter = relocation?.tocEntry?.label;
  const position = positionLabel(relocation);
  return chapter ? `${chapter} · ${position}` : position;
}

export function backLabel({ page, fraction }: Relocation): string {
  return page ? `Back to page ${page.current}` : `Back to ${Math.round(fraction * 100)}%`;
}

type SeekBarProps = { renderer: BookRenderer; jump: Jump; relocation: Relocation | undefined };

export function SeekBar({ renderer, jump, relocation }: SeekBarProps) {
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
    const seek = () => {
      void jump({ fraction: fractionOf(Number(element.value), min, max) }).finally(() => setDraggedTo(undefined));
    };
    element.addEventListener('change', seek);
    return () => element.removeEventListener('change', seek);
  }, [jump, min, max]);

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
  const card = useRef<HTMLDivElement>(null);
  const caret = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const element = card.current;
    if (!element || !caret.current) return;
    const left = Math.min(Math.max(x - element.offsetWidth / 2, 0), Math.max(width - element.offsetWidth, 0));
    element.style.left = `${left}px`;
    caret.current.style.left = `${x - left}px`;
  }, [x, width, chapter, position]);

  return (
    <div
      ref={card}
      aria-hidden="true"
      className="pointer-events-none absolute bottom-full mb-2 max-w-full rounded-lg border border-(--reader-line) bg-(--reader-bg) px-4 py-1.5 text-center whitespace-nowrap shadow-lg"
    >
      <span
        ref={caret}
        className="absolute top-full size-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45 border-r border-b border-(--reader-line) bg-(--reader-bg)"
      />
      {chapter && <p className="truncate text-sm font-semibold text-(--reader-fg)">{chapter}</p>}
      <p className={chapter ? 'text-xs text-(--reader-muted) tabular-nums' : 'text-sm font-semibold text-(--reader-fg)'}>{position}</p>
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

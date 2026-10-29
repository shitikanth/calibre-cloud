import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import type { BookDetail } from '../library/protocol.ts';
import type { SwipeDirection } from '../reader/swipe.ts';

export type ControlsState = 'hidden' | 'peek' | 'pinned';

type BarState = { shown: boolean; onPin: () => void; onLeave: () => void };

type BarProps = BarState & { as: 'header' | 'footer'; className: string; children: ReactNode };

function Bar({ as: Element, shown, onPin, onLeave, className, children }: BarProps) {
  return (
    <Element
      className={`absolute z-30 bg-(--reader-bg)/90 backdrop-blur-sm transition-opacity duration-150 motion-reduce:transition-none ${
        shown ? 'opacity-100' : 'pointer-events-none opacity-0'
      } ${className}`}
      onFocus={onPin}
      onPointerDown={onPin}
      onPointerLeave={onLeave}
    >
      {children}
    </Element>
  );
}

export function BackToBookLink({ book }: { book: BookDetail }) {
  return (
    <Link
      to="/books/$bookId"
      params={{ bookId: String(book.id) }}
      aria-label="Back to book"
      className="flex min-h-11 min-w-11 items-center justify-center rounded hover:bg-(--reader-hover)"
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5 fill-none stroke-current stroke-2">
        <path d="M15 5l-7 7 7 7" />
      </svg>
    </Link>
  );
}

type TopBarProps = BarState & { book: BookDetail; tools?: ReactNode | undefined; wide: boolean };

export function TopBar({ book, tools, wide, ...bar }: TopBarProps) {
  return (
    <Bar
      as="header"
      {...bar}
      className={`inset-x-0 top-0 border-b border-(--reader-line) px-2 py-1 ${
        wide ? 'grid grid-cols-[1fr_minmax(0,auto)_1fr] items-center gap-2' : 'flex items-center gap-2'
      }`}
    >
      <div className="flex">
        <BackToBookLink book={book} />
      </div>
      <h1 className="min-w-0 truncate text-sm font-medium">{book.title}</h1>
      {wide && <div className="flex justify-end">{tools}</div>}
    </Bar>
  );
}

export function JumpBack({ label, onBack }: { label: string; onBack: () => void }) {
  return (
    <button
      type="button"
      className="min-h-9 shrink-0 rounded-full border border-(--reader-line) px-3 text-sm whitespace-nowrap hover:bg-(--reader-hover)"
      onClick={onBack}
    >
      {label}
    </button>
  );
}

type BottomBarProps = BarState & {
  seekBar: ReactNode;
  whereYouAre: string;
  back?: ReactNode | undefined;
  tools?: ReactNode | undefined;
  wide: boolean;
};

export function BottomBar({ seekBar, whereYouAre, back, tools, wide, ...bar }: BottomBarProps) {
  const where = <p className={`min-w-0 truncate text-sm text-(--reader-muted) ${wide ? 'text-center' : 'flex-1'}`}>{whereYouAre}</p>;
  return (
    <Bar
      as="footer"
      {...bar}
      className={
        wide
          ? 'bottom-3 left-1/2 w-[calc(100%-2rem)] max-w-[560px] -translate-x-1/2 rounded-xl border border-(--reader-line) px-4 pb-2 shadow-lg'
          : 'inset-x-0 bottom-0 border-t border-(--reader-line) px-4 pb-[max(0.25rem,env(safe-area-inset-bottom))]'
      }
    >
      {seekBar}
      {wide ? (
        <div className="grid grid-cols-[1fr_minmax(0,auto)_1fr] items-center gap-2">
          <div className="flex">{back}</div>
          {where}
        </div>
      ) : (
        <div className="flex items-center gap-2">
          {back}
          {where}
          {tools}
        </div>
      )}
    </Bar>
  );
}

const zoneShare = 0.22;

export function zoneAt(x: number, page: HTMLElement | null): SwipeDirection | undefined {
  if (!page) return undefined;
  const { left, width } = page.getBoundingClientRect();
  const across = (x - left) / width;
  if (across < zoneShare) return 'previous';
  if (across > 1 - zoneShare) return 'next';
  return undefined;
}

// Pointer taps go through to the book, so a link under a zone still works; the screen turns the page from where a tap lands.
export function TapZone({ direction, onTurn }: { direction: SwipeDirection; onTurn: (direction: SwipeDirection) => void }) {
  const previous = direction === 'previous';
  return (
    <button
      type="button"
      aria-label={previous ? 'Previous page' : 'Next page'}
      className={`group/zone pointer-events-none absolute inset-y-0 z-10 flex items-center focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--reader-muted) ${
        previous ? 'left-0 justify-start pl-2' : 'right-0 justify-end pr-2'
      }`}
      style={{ width: `${zoneShare * 100}%` }}
      onClick={() => onTurn(direction)}
    >
      <span
        aria-hidden="true"
        className="text-3xl text-(--reader-muted) opacity-0 transition-opacity group-hover/page:opacity-40 group-focus-visible/zone:opacity-100"
      >
        {previous ? '‹' : '›'}
      </span>
    </button>
  );
}

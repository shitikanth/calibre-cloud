import { useRef, useState, type ReactNode } from 'react';
import { useDismiss } from './use-dismiss.ts';

export const panelClass =
  'absolute right-0 z-20 mt-1 max-h-[70dvh] w-72 overflow-y-auto rounded border border-(--reader-line) bg-(--reader-bg) text-(--reader-fg) shadow-lg';

export function ReaderPopover({ label, icon, children }: { label: string; icon: ReactNode; children: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useDismiss(open, setOpen, root);

  return (
    <div ref={root} className="relative shrink-0">
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
        className="flex min-h-11 min-w-11 items-center justify-center rounded hover:bg-(--reader-hover)"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5 fill-none stroke-current stroke-2">
          {icon}
        </svg>
      </button>
      {open && children(() => setOpen(false))}
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import { useLibrarySession } from '../library/session.tsx';
import type { Disconnect } from '../library/use-disconnect.ts';

const menuId = 'app-menu';
const itemClass = 'block w-full px-4 py-2 text-left text-sm hover:bg-neutral-100 disabled:opacity-60 disabled:hover:bg-transparent';

export function OverflowMenu({ disconnect }: { disconnect: Disconnect }) {
  const { library, update } = useLibrarySession();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsidePress = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutsidePress);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePress);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  const choose = (action: () => void) => {
    setOpen(false);
    action();
  };

  return (
    <div ref={root} className="relative shrink-0">
      <button
        type="button"
        aria-label="More"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
        className="rounded p-2 hover:bg-neutral-100"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5 fill-current">
          <circle cx="12" cy="5" r="2" />
          <circle cx="12" cy="12" r="2" />
          <circle cx="12" cy="19" r="2" />
        </svg>
      </button>
      {open && (
        <div id={menuId} role="menu" className="absolute right-0 z-20 mt-1 w-52 rounded border border-neutral-300 bg-white py-1 shadow-lg">
          <button
            type="button"
            role="menuitem"
            className={itemClass}
            disabled={!library.isSuccess || update.isFetching}
            onClick={() => choose(() => void update.refetch())}
          >
            {update.isFetching ? 'Checking for changes…' : 'Refresh library'}
          </button>
          <button
            type="button"
            role="menuitem"
            className={itemClass}
            disabled={disconnect.isPending}
            onClick={() => choose(() => disconnect.mutate())}
          >
            Disconnect
          </button>
        </div>
      )}
    </div>
  );
}

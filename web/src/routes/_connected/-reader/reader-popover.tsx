import { useRef, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import { useDismiss } from '../-connected/use-dismiss.ts';

export const panelClass =
  'max-h-[70dvh] w-72 overflow-y-auto rounded border border-(--reader-line) bg-(--reader-bg) text-(--reader-fg) shadow-lg';

export function scrollToCurrent(panel: HTMLElement | null) {
  const marked = panel?.querySelector<HTMLElement>('[aria-current="true"]');
  if (!panel || !marked) return;
  const offset = marked.getBoundingClientRect().top - panel.getBoundingClientRect().top + panel.scrollTop;
  panel.scrollTop = offset - (panel.clientHeight - marked.offsetHeight) / 2;
}

export type PopoverPlacement = 'below' | 'above';

const placements: Record<PopoverPlacement, string> = { below: 'top-full mt-1', above: 'bottom-full mb-1' };

export type PopoverToggle = { open: boolean; setOpen: Dispatch<SetStateAction<boolean>> };

type ReaderPopoverProps = Readonly<{
  label: string;
  icon: ReactNode;
  placement: PopoverPlacement;
  toggle: PopoverToggle;
  shortcut?: string | undefined;
  children: (close: () => void) => ReactNode;
}>;

export function ReaderPopover({ label, icon, placement, toggle, shortcut, children }: ReaderPopoverProps) {
  const { open, setOpen } = toggle;
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  useDismiss(open, setOpen, root, button);

  return (
    <div ref={root} className="relative shrink-0">
      <button
        ref={button}
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-keyshortcuts={shortcut}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
        className="flex min-h-11 min-w-11 items-center justify-center rounded hover:bg-(--reader-hover)"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5 fill-none stroke-current stroke-2">
          {icon}
        </svg>
      </button>
      {open && <div className={`absolute right-0 z-20 ${placements[placement]}`}>{children(() => setOpen(false))}</div>}
    </div>
  );
}

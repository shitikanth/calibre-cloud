import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { takesShortcut } from './shortcut-keys.ts';

type Shortcut = { keys: string[][]; does: string };

const groups: { name: string; shortcuts: Shortcut[] }[] = [
  {
    name: 'Library',
    shortcuts: [
      { keys: [['/']], does: 'Focus the search box' },
      { keys: [['←'], ['→'], ['↑'], ['↓']], does: 'Move between books' },
      { keys: [['Home'], ['End']], does: 'First / last book' },
      { keys: [['Page Up'], ['Page Down']], does: 'A screen up / down' },
      { keys: [['Enter']], does: 'Open the focused book' },
    ],
  },
  {
    name: 'Reader',
    shortcuts: [
      { keys: [['←'], ['→']], does: 'Previous / next page' },
      { keys: [['Space'], ['Shift', 'Space']], does: 'Next / previous page' },
      { keys: [['Page Up'], ['Page Down']], does: 'Previous / next page' },
      { keys: [['['], [']']], does: 'Previous / next chapter' },
      { keys: [['t']], does: 'Toggle the table of contents' },
      { keys: [['/']], does: 'Search in book' },
      { keys: [['n'], ['Shift', 'n']], does: 'Next / previous search match' },
      { keys: [['Backspace']], does: 'Go back to where you jumped from' },
      { keys: [['Tab']], does: 'Show the controls' },
      { keys: [['Esc']], does: 'Hide the controls' },
    ],
  },
];

const ShortcutsHelpContext = createContext<(() => void) | undefined>(undefined);

export function useShowShortcuts(): (() => void) | undefined {
  return useContext(ShortcutsHelpContext);
}

export function ShortcutsHelp({ children }: { children: ReactNode }) {
  const [returnFocus, setReturnFocus] = useState<HTMLElement | undefined>(undefined);
  const [open, setOpen] = useState(false);

  const show = useCallback(() => {
    setReturnFocus(document.activeElement instanceof HTMLElement ? document.activeElement : undefined);
    setOpen(true);
  }, []);

  useEffect(() => {
    const showOnQuestionMark = (event: KeyboardEvent) => {
      if (event.key !== '?' || !takesShortcut(event)) return;
      event.preventDefault();
      show();
    };
    window.addEventListener('keydown', showOnQuestionMark);
    return () => window.removeEventListener('keydown', showOnQuestionMark);
  }, [show]);

  const close = () => {
    setOpen(false);
    returnFocus?.focus();
  };

  return (
    <ShortcutsHelpContext.Provider value={show}>
      {children}
      {open && <ShortcutsDialog onClose={close} />}
    </ShortcutsHelpContext.Provider>
  );
}

const keyClass =
  'inline-flex h-6 min-w-6 items-center justify-center rounded border border-neutral-300 bg-neutral-50 px-1.5 font-sans text-xs font-medium text-neutral-700 shadow-[inset_0_-1px_0_var(--color-neutral-300)]';

function Keys({ keys }: { keys: string[][] }) {
  return (
    <span className="flex shrink-0 items-center gap-2">
      {keys.map((combo) => (
        <span key={combo.join('+')} className="flex items-center gap-1">
          {combo.map((key, index) => (
            <span key={key} className="flex items-center gap-1">
              {index > 0 && <span className="text-xs text-neutral-400">+</span>}
              <kbd className={keyClass}>{key}</kbd>
            </span>
          ))}
        </span>
      ))}
    </span>
  );
}

function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!dialog.current?.open) dialog.current?.showModal();
    dialog.current?.focus();
  }, []);

  const close = () => dialog.current?.close();

  return (
    <dialog
      ref={dialog}
      tabIndex={-1}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
      className="m-auto max-h-[calc(100dvh-2rem)] w-[min(46rem,calc(100vw-2rem))] overflow-y-auto rounded-lg border border-neutral-200 bg-white p-0 text-neutral-900 shadow-xl outline-none backdrop:bg-black/40"
    >
      <header className="flex items-center justify-between border-b border-neutral-200 py-2 pr-2 pl-5">
        <h2 id={titleId} className="font-semibold">
          Keyboard shortcuts
        </h2>
        <button
          type="button"
          aria-label="Close"
          className="flex size-10 items-center justify-center rounded text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
          onClick={close}
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5 fill-none stroke-current stroke-2">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </header>
      <div className="grid gap-x-10 gap-y-6 px-5 py-4 sm:grid-cols-2">
        {groups.map((group) => (
          <section key={group.name}>
            <h3 className="text-xs font-semibold tracking-wide text-neutral-500 uppercase">{group.name}</h3>
            <dl className="mt-2 divide-y divide-neutral-100">
              {group.shortcuts.map((shortcut) => (
                <div key={shortcut.does + shortcut.keys.join()} className="flex items-center justify-between gap-4 py-2 text-sm">
                  <dt className="text-neutral-700">{shortcut.does}</dt>
                  <dd>
                    <Keys keys={shortcut.keys} />
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
      <p className="border-t border-neutral-200 px-5 py-3 text-xs text-neutral-500">
        Press <kbd className={keyClass}>?</kbd> to open this list again.
      </p>
    </dialog>
  );
}

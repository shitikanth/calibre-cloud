import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { takesShortcut } from './shortcut-keys.ts';

type Shortcut = { keys: string[][]; does: string };

const help: Shortcut = { keys: [['?']], does: 'Show keyboard shortcuts' };

const groups: { name: string; shortcuts: Shortcut[] }[] = [
  {
    name: 'Library',
    shortcuts: [
      { keys: [['/']], does: 'Focus the search box' },
      { keys: [['←'], ['→'], ['↑'], ['↓']], does: 'Move between books' },
      { keys: [['Enter']], does: 'Open the focused book' },
      help,
    ],
  },
  {
    name: 'Reader',
    shortcuts: [
      { keys: [['←'], ['→']], does: 'Previous / next page' },
      { keys: [['Space'], ['Shift', 'Space']], does: 'Next / previous page' },
      { keys: [['Page Down'], ['Page Up']], does: 'Next / previous page' },
      { keys: [['['], [']']], does: 'Previous / next chapter' },
      { keys: [['t']], does: 'Toggle the table of contents' },
      { keys: [['/']], does: 'Search in book' },
      { keys: [['n'], ['Shift', 'n']], does: 'Next / previous search match' },
      { keys: [['Backspace']], does: 'Go back to where you jumped from' },
      { keys: [['Tab']], does: 'Show the controls' },
      { keys: [['Esc']], does: 'Hide the controls' },
      help,
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

function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!dialog.current?.open) dialog.current?.showModal();
  }, []);

  const close = () => dialog.current?.close();

  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
      className="m-auto max-h-[calc(100dvh-2rem)] w-[min(32rem,calc(100vw-2rem))] rounded border border-neutral-300 bg-white p-0 text-neutral-900 shadow-lg backdrop:bg-black/40"
    >
      <div className="flex flex-col gap-4 p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 id={titleId} className="font-semibold">
            Keyboard shortcuts
          </h2>
          <button type="button" className="min-h-11 rounded border border-neutral-300 px-3 py-1 text-sm hover:bg-neutral-100" onClick={close}>
            Close
          </button>
        </div>
        {groups.map((group) => (
          <section key={group.name}>
            <h3 className="text-xs font-semibold tracking-wide text-neutral-600 uppercase">{group.name}</h3>
            <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
              {group.shortcuts.map((shortcut) => (
                <div key={shortcut.does + shortcut.keys.join()} className="contents">
                  <dt className="flex flex-wrap items-center gap-1">
                    {shortcut.keys.map((combo, index) => (
                      <span key={combo.join('+')} className="flex items-center gap-1">
                        {index > 0 && <span className="text-neutral-500">/</span>}
                        {combo.map((key) => (
                          <kbd key={key} className="rounded border border-neutral-300 bg-neutral-50 px-1.5 font-sans text-xs">
                            {key}
                          </kbd>
                        ))}
                      </span>
                    ))}
                  </dt>
                  <dd>{shortcut.does}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </dialog>
  );
}

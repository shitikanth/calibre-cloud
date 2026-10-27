import { useEffect, useId, useRef } from 'react';
import { canOpenExternally } from '../reader/external-link.ts';

const buttonClass = 'min-h-11 rounded border border-(--reader-line) px-3 py-1 text-sm hover:bg-(--reader-hover)';

export function ExternalLinkDialog({ url, onClose }: { url: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const openable = canOpenExternally(url);

  useEffect(() => {
    if (!dialog.current?.open) dialog.current?.showModal();
  }, []);

  const close = () => dialog.current?.close();
  const open = () => {
    window.open(url, '_blank', 'noopener,noreferrer');
    close();
  };

  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
      className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded border border-(--reader-line) bg-(--reader-bg) p-0 text-(--reader-fg) shadow-lg backdrop:bg-black/40"
    >
      <div className="flex flex-col gap-3 p-4">
        <h2 id={titleId} className="font-semibold">
          {openable ? 'Open this link?' : 'This link can’t be opened'}
        </h2>
        <p className="text-sm break-all text-(--reader-muted)">{url}</p>
        <div className="flex justify-end gap-2">
          {openable ? (
            <>
              <button type="button" className={buttonClass} onClick={close}>
                Cancel
              </button>
              <button type="button" className={buttonClass} onClick={open}>
                Open
              </button>
            </>
          ) : (
            <button type="button" className={buttonClass} onClick={close}>
              Close
            </button>
          )}
        </div>
      </div>
    </dialog>
  );
}

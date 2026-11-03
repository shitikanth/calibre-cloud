import { useEffect, type Dispatch, type RefObject, type SetStateAction } from 'react';

export function useDismiss(
  open: boolean,
  setOpen: Dispatch<SetStateAction<boolean>>,
  root: RefObject<HTMLElement | null>,
  returnFocusTo?: RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    if (!open) return;
    const closeOnOutsidePress = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (returnFocusTo && root.current?.contains(document.activeElement)) returnFocusTo.current?.focus();
      setOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutsidePress);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePress);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open, setOpen, root, returnFocusTo]);
}

import { useSyncExternalStore } from 'react';

const wide = '(min-width: 48rem)';

function subscribe(onChange: () => void) {
  const query = window.matchMedia(wide);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

export function useWide(): boolean {
  return useSyncExternalStore(subscribe, () => window.matchMedia(wide).matches);
}

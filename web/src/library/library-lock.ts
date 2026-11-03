const LOCK_NAME = 'calibre-cloud:library-db';

export function withLibraryLock<T>(mode: LockMode, run: () => Promise<T>): Promise<T> {
  if (!('locks' in navigator)) return run();
  return navigator.locks.request(LOCK_NAME, { mode }, run);
}

export type StoredLibrary = { version: string; file: string };

const storageKey = 'calibre-cloud:library';

export function loadStoredLibrary(): StoredLibrary | undefined {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(storageKey) ?? 'null');
    if (isStoredLibrary(stored)) return stored;
  } catch {
    return undefined;
  }
  return undefined;
}

export function saveStoredLibrary(library: StoredLibrary | undefined): void {
  if (library) localStorage.setItem(storageKey, JSON.stringify(library));
  else localStorage.removeItem(storageKey);
}

function isStoredLibrary(value: unknown): value is StoredLibrary {
  if (typeof value !== 'object' || value === null) return false;
  const { version, file } = value as Record<string, unknown>;
  return typeof version === 'string' && typeof file === 'string';
}

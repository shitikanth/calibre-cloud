export type Connection = { provider: 'mega'; link: string };

const storageKey = 'calibre-cloud:connection';

export function loadConnection(): Connection | undefined {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(storageKey) ?? 'null');
    if (isConnection(stored)) return stored;
  } catch {
    return undefined;
  }
  return undefined;
}

export function saveConnection(connection: Connection): void {
  localStorage.setItem(storageKey, JSON.stringify(connection));
}

export function clearConnection(): void {
  localStorage.removeItem(storageKey);
}

function isConnection(value: unknown): value is Connection {
  if (typeof value !== 'object' || value === null) return false;
  const { provider, link } = value as Record<string, unknown>;
  return provider === 'mega' && typeof link === 'string';
}

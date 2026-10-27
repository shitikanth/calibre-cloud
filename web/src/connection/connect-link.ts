const prefix = 'connect=';

export function readConnectLink(hash: string): string | undefined {
  const fragment = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!fragment.startsWith(prefix)) return undefined;
  const value = fragment.slice(prefix.length);
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function connectLinkHref(origin: string, input: string): string {
  return `${origin}/#${prefix}${encodeURIComponent(input)}`;
}

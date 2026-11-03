export function connectPath(providerId: string): string {
  return `/connect/${encodeURIComponent(providerId)}`;
}

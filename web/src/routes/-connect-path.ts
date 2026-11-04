export function connectPath(providerId: string, redirect?: string): string {
  const path = `/connect/${encodeURIComponent(providerId)}`;
  return redirect ? `${path}?${new URLSearchParams({ redirect })}` : path;
}

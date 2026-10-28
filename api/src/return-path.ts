export function sameOriginPath(origin: string, candidate: string | undefined): string | undefined {
  if (candidate === undefined) return '/';
  if (!candidate.startsWith('/') || candidate.startsWith('//') || candidate.startsWith('/\\')) return undefined;
  const url = new URL(candidate, origin);
  if (url.origin !== origin) return undefined;
  return url.pathname + url.search;
}

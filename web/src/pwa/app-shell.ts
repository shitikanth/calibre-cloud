export type Route = 'shell' | 'precached' | 'network';

export interface RoutedRequest {
  readonly url: string;
  readonly mode: RequestMode;
  readonly method: string;
}

const shellFile = /^(index\.html|favicon\.svg|manifest\.webmanifest|(assets|icons)\/.+|pdfjs\/.+\.(wasm|js))$/;

export function shellPaths(builtFiles: readonly string[]): string[] {
  return builtFiles.filter((file) => shellFile.test(file)).map((file) => (file === 'index.html' ? '/' : `/${file}`));
}

const outsideTheApp = /^\/(api(\/|$)|(about|privacy|terms)(\.html)?\/?$)/;

export function routeRequest(request: RoutedRequest, origin: string, precached: ReadonlySet<string>): Route {
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== origin || outsideTheApp.test(url.pathname)) return 'network';
  if (request.mode === 'navigate') return 'shell';
  return url.search === '' && precached.has(url.pathname) ? 'precached' : 'network';
}

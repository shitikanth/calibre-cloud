export type ResponseSource = 'shell' | 'precached' | 'network';

export interface AppShell {
  readonly version: string;
  readonly paths: readonly string[];
}

export interface RoutedRequest {
  readonly url: string;
  readonly mode: RequestMode;
  readonly method: string;
}

const shellFile = /^(index\.html|favicon\.svg|manifest\.webmanifest|(assets|icons)\/.+|pdfjs\/.+\.(wasm|js))$/;

export function shellPaths(builtFiles: readonly string[]): string[] {
  return builtFiles.filter((file) => shellFile.test(file)).map((file) => (file === 'index.html' ? '/' : `/${file}`));
}

export function belongsInShell(path: string, response: Response): boolean {
  const type = (response.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase();
  return response.ok && (path === '/') === (type === 'text/html');
}

const outsideTheApp = /^\/(api(\/|$)|(about|privacy|terms)(\.html)?\/?$)/;

export function responseSource(request: RoutedRequest, origin: string, precached: ReadonlySet<string>): ResponseSource {
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== origin || outsideTheApp.test(url.pathname)) return 'network';
  if (request.mode === 'navigate') return 'shell';
  return url.search === '' && precached.has(url.pathname) ? 'precached' : 'network';
}

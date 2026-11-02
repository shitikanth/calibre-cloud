export type FakeGraphItem = { path: string; content?: string; unindexed?: boolean };

export type FakeFailure = { status: number; code?: string; headers?: Record<string, string> };

export type FakeRequest = { host: 'graph' | 'download'; path: string; token: string | undefined };

type Entry = { path: string; folder: boolean; content: string; unindexed: boolean };

type ItemShape = 'single' | 'listed' | 'search-hit';

const graphOrigin = 'https://graph.microsoft.com';
const graphPrefix = '/v1.0/me/drive';

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
}

function failure({ status, code, headers }: FakeFailure): Response {
  return json(status, { error: { code: code ?? 'generalException', message: `HTTP ${status}` } }, headers);
}

function abortError(): DOMException {
  return new DOMException('The operation was aborted.', 'AbortError');
}

function streamOf(bytes: Uint8Array, chunkSize: number, signal: AbortSignal | null | undefined): ReadableStream<Uint8Array> {
  let offset = 0;
  return new ReadableStream({
    start(controller) {
      signal?.addEventListener('abort', () => controller.error(abortError()), { once: true });
    },
    pull(controller) {
      if (offset >= bytes.byteLength) return controller.close();
      controller.enqueue(bytes.slice(offset, offset + chunkSize));
      offset += chunkSize;
    },
  });
}

function nameOf(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

function parentOf(path: string): string {
  return path.slice(0, path.lastIndexOf('/'));
}

function encodePath(path: string): string {
  return path.split('/').filter(Boolean).map(encodeURIComponent).join('/');
}

function decodePath(encoded: string): string {
  const segments = encoded.split('/').filter(Boolean).map(decodeURIComponent);
  return segments.length === 0 ? '' : `/${segments.join('/')}`;
}

const byPathSyntax = /^\/root(?::\/([^:]*))?(?::)?(?:\/(children|search\(q='(.*)'\)))?$/;

export class FakeGraph {
  readonly requests: FakeRequest[] = [];
  readonly validTokens = new Set(['token']);
  downloadHost = 'https://fake.files.1drv.com';
  encodesParentPaths = true;
  searchHitsCarryParentPath = true;
  maxPageSize = 200;
  chunkSize = 4;
  private downloadGeneration = 1;
  private readonly entries = new Map<string, Entry>();
  private readonly failures: { failure: FakeFailure; matches: (request: FakeRequest) => boolean }[] = [];

  constructor(items: FakeGraphItem[] = []) {
    for (const item of items) this.add(item);
  }

  add({ path, content, unindexed = false }: FakeGraphItem): void {
    for (let parent = parentOf(path); parent; parent = parentOf(parent)) {
      if (!this.entries.has(parent.toLowerCase())) this.entries.set(parent.toLowerCase(), { path: parent, folder: true, content: '', unindexed });
    }
    this.entries.set(path.toLowerCase(), { path, folder: content === undefined, content: content ?? '', unindexed });
  }

  failNext(failure: FakeFailure, matches: (request: FakeRequest) => boolean = () => true): void {
    this.failures.push({ failure, matches });
  }

  requestsTo(host: FakeRequest['host'], pathPrefix = ''): FakeRequest[] {
    return this.requests.filter((request) => request.host === host && request.path.startsWith(pathPrefix));
  }

  expireDownloadUrls(): void {
    this.downloadGeneration++;
  }

  fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    if (init?.signal?.aborted) throw abortError();
    const url = new URL(input instanceof Request ? input.url : String(input));
    const headers = new Headers(init?.headers);
    const token = headers.get('Authorization')?.replace(/^Bearer /, '');
    const host: FakeRequest['host'] = url.origin === this.downloadHost ? 'download' : 'graph';
    const request: FakeRequest = { host, path: url.pathname + url.search, token };
    this.requests.push(request);

    if ((init?.method ?? 'GET') !== 'GET') return failure({ status: 405, code: 'methodNotAllowed' });
    const failed = this.failures.findIndex(({ matches }) => matches(request));
    if (failed >= 0) return failure(this.failures.splice(failed, 1)[0]!.failure);
    if (host === 'download') return this.download(url, headers, init?.signal);
    if (url.origin !== graphOrigin || !url.pathname.startsWith(graphPrefix)) return failure({ status: 404, code: 'unknownHost' });
    if (!token || !this.validTokens.has(token)) return failure({ status: 401, code: 'InvalidAuthenticationToken' });

    const rest = url.pathname.slice(graphPrefix.length);
    if (rest.startsWith('/items/')) return this.itemById(decodeURIComponent(rest.slice('/items/'.length)));
    const match = byPathSyntax.exec(rest);
    if (!match) return failure({ status: 400, code: 'invalidRequest' });
    const [, encodedPath = '', collection, query] = match;
    const path = decodePath(encodedPath);
    const skip = Number(url.searchParams.get('$skiptoken') ?? 0);
    if (collection === undefined) return this.item(path);
    if (collection === 'children') return this.children(path, skip, url);
    return this.search(decodeURIComponent(query ?? '').replaceAll("''", "'"), skip, url);
  };

  private item(path: string): Response {
    const entry = this.entries.get(path.toLowerCase());
    return entry ? json(200, this.driveItem(entry, 'single')) : failure({ status: 404, code: 'itemNotFound' });
  }

  private itemById(id: string): Response {
    const entry = [...this.entries.values()].find((candidate) => this.idOf(candidate) === id);
    return entry ? json(200, this.driveItem(entry, 'single')) : failure({ status: 404, code: 'itemNotFound' });
  }

  private idOf(entry: Entry): string {
    return `id-${entry.path.toLowerCase()}`;
  }

  private children(path: string, skip: number, url: URL): Response {
    if (path !== '') {
      const folder = this.entries.get(path.toLowerCase());
      if (!folder) return failure({ status: 404, code: 'itemNotFound' });
      if (!folder.folder) return failure({ status: 400, code: 'invalidRequest' });
    }
    const children = [...this.entries.values()].filter((entry) => parentOf(entry.path).toLowerCase() === path.toLowerCase());
    return this.page(children, skip, url, 'listed');
  }

  private search(query: string, skip: number, url: URL): Response {
    const needle = query.toLowerCase();
    const hits = [...this.entries.values()].filter((entry) => !entry.unindexed && nameOf(entry.path).toLowerCase().includes(needle));
    return this.page(hits, skip, url, this.searchHitsCarryParentPath ? 'listed' : 'search-hit');
  }

  private page(entries: Entry[], skip: number, url: URL, shape: ItemShape): Response {
    const end = skip + this.maxPageSize;
    const next = new URL(url);
    next.searchParams.set('$skiptoken', String(end));
    return json(200, {
      value: entries.slice(skip, end).map((entry) => this.driveItem(entry, shape)),
      ...(end < entries.length ? { '@odata.nextLink': next.href } : {}),
    });
  }

  private download(url: URL, headers: Headers, signal: AbortSignal | null | undefined): Response {
    if (headers.has('Authorization')) return new Response('Authorization header not allowed', { status: 400 });
    if (url.searchParams.get('tempauth') !== String(this.downloadGeneration)) return new Response('expired', { status: 403 });
    const entry = this.entries.get(decodePath(url.pathname).toLowerCase());
    if (!entry || entry.folder) return new Response('gone', { status: 404 });
    const bytes = new TextEncoder().encode(entry.content);
    return new Response(streamOf(bytes, this.chunkSize, signal), { headers: { 'Content-Type': 'application/octet-stream' } });
  }

  private driveItem(entry: Entry, shape: ItemShape) {
    const parent = parentOf(entry.path);
    const single = shape === 'single';
    const common = {
      id: this.idOf(entry),
      name: nameOf(entry.path),
      eTag: `etag-${entry.path}`,
      parentReference: {
        driveId: 'drive-1',
        id: `id-${parent.toLowerCase() || '/'}`,
        ...(shape === 'search-hit'
          ? {}
          : { path: `/drive/root:${parent ? `/${this.encodesParentPaths ? encodePath(parent) : parent.slice(1)}` : ''}` }),
      },
    };
    if (entry.folder) return { ...common, folder: { childCount: 0 } };
    const bytes = new TextEncoder().encode(entry.content);
    return {
      ...common,
      size: bytes.byteLength,
      cTag: `ctag-of-${entry.content}`,
      file: { mimeType: 'application/octet-stream' },
      ...(single ? { '@microsoft.graph.downloadUrl': `${this.downloadHost}/${encodePath(entry.path)}?tempauth=${this.downloadGeneration}` } : {}),
    };
  }
}

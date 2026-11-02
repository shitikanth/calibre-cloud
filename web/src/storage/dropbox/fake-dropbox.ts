export type FakeDropboxItem = { path: string; content?: string; unindexed?: boolean };

export type FakeFailure = { status: number; summary?: string; headers?: Record<string, string> };

export type FakeRequest = { endpoint: string; token: string | undefined; arg: unknown; header: string | null };

type Entry = { path: string; folder: boolean; content: string; unindexed: boolean };

const apiOrigin = 'https://api.dropboxapi.com';
const contentOrigin = 'https://content.dropboxapi.com';

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
}

function failure({ status, summary, headers }: FakeFailure): Response {
  if (status === 409 || status === 401) {
    const tag = (summary ?? 'other/').split('/')[0]!;
    return json(status, { error_summary: summary ?? 'other/', error: { '.tag': tag } }, headers);
  }
  return new Response(summary ?? `HTTP ${status}`, { status, headers: { 'Content-Type': 'text/plain', ...headers } });
}

function lookupFailure(tag: 'not_found' | 'not_file' | 'not_folder'): Response {
  return failure({ status: 409, summary: `path/${tag}/..` });
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

function isHeaderSafe(value: string): boolean {
  return /^[\x20-\x7e]*$/.test(value);
}

export class FakeDropbox {
  readonly requests: FakeRequest[] = [];
  readonly validTokens = new Set(['token']);
  maxPageSize = 1000;
  chunkSize = 4;
  private readonly entries = new Map<string, Entry>();
  private readonly failures: { failure: FakeFailure; matches: (endpoint: string) => boolean }[] = [];

  constructor(items: FakeDropboxItem[] = []) {
    for (const item of items) this.add(item);
  }

  add({ path, content, unindexed = false }: FakeDropboxItem): void {
    for (let parent = parentOf(path); parent; parent = parentOf(parent)) {
      if (!this.entries.has(parent.toLowerCase())) this.entries.set(parent.toLowerCase(), { path: parent, folder: true, content: '', unindexed });
    }
    this.entries.set(path.toLowerCase(), { path, folder: content === undefined, content: content ?? '', unindexed });
  }

  failNext(failure: FakeFailure, matches: (endpoint: string) => boolean = () => true): void {
    this.failures.push({ failure, matches });
  }

  requestsTo(endpoint: string): FakeRequest[] {
    return this.requests.filter((request) => request.endpoint === endpoint);
  }

  fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    if (init?.signal?.aborted) throw abortError();
    const url = new URL(input instanceof Request ? input.url : String(input));
    const headers = new Headers(init?.headers);
    const token = headers.get('Authorization')?.replace(/^Bearer /, '');
    const header = headers.get('Dropbox-API-Arg');
    const endpoint = url.pathname.replace(/^\/2\//, '');
    const content = url.origin === contentOrigin;
    let arg: unknown;
    try {
      arg = JSON.parse(content ? (header ?? '') : String(init?.body ?? ''));
    } catch {
      arg = undefined;
    }
    this.requests.push({ endpoint, token, arg, header });

    if (init?.method !== 'POST') return failure({ status: 400, summary: 'Expected POST' });
    if (url.origin !== apiOrigin && !content) return failure({ status: 404 });
    if (!token || !this.validTokens.has(token)) return failure({ status: 401, summary: 'invalid_access_token/' });
    if (content && (header === null || !isHeaderSafe(header))) return failure({ status: 400, summary: 'Bad Dropbox-API-Arg header' });
    if (!content && headers.get('Content-Type') !== 'application/json') return failure({ status: 400, summary: 'Bad Content-Type' });
    if (typeof arg !== 'object' || arg === null) return failure({ status: 400, summary: 'Bad argument' });
    const failed = this.failures.findIndex(({ matches }) => matches(endpoint));
    if (failed >= 0) return failure(this.failures.splice(failed, 1)[0]!.failure);

    const args = arg as Record<string, unknown>;
    if (content && endpoint === 'files/download') return this.download(String(args.path), init.signal);
    switch (endpoint) {
      case 'files/get_metadata':
        return this.metadataOf(String(args.path));
      case 'files/list_folder':
        return this.listFolder(String(args.path), 0);
      case 'files/list_folder/continue':
        return this.continueWith(args.cursor, (path, offset) => this.listFolder(path, offset));
      case 'files/search_v2':
        return this.search(args, 0);
      case 'files/search/continue_v2':
        return this.continueWith(args.cursor, (query, offset) => this.search({ query, options: { filename_only: true } }, offset));
      default:
        return failure({ status: 400, summary: `Unknown endpoint ${endpoint}` });
    }
  };

  private metadataOf(path: string): Response {
    const entry = this.entries.get(path.toLowerCase());
    return entry ? json(200, this.metadata(entry)) : lookupFailure('not_found');
  }

  private download(path: string, signal: AbortSignal | null | undefined): Response {
    const entry = this.entries.get(path.toLowerCase());
    if (!entry) return lookupFailure('not_found');
    if (entry.folder) return lookupFailure('not_file');
    const bytes = new TextEncoder().encode(entry.content);
    return new Response(streamOf(bytes, this.chunkSize, signal), { headers: { 'Content-Type': 'application/octet-stream' } });
  }

  private listFolder(path: string, offset: number): Response {
    if (path !== '') {
      const folder = this.entries.get(path.toLowerCase());
      if (!folder) return lookupFailure('not_found');
      if (!folder.folder) return lookupFailure('not_folder');
    }
    const children = [...this.entries.values()].filter((entry) => parentOf(entry.path).toLowerCase() === path.toLowerCase());
    return this.page(children.map((entry) => this.metadata(entry)), offset, path, (entries) => ({ entries }));
  }

  private search(args: Record<string, unknown>, offset: number): Response {
    const query = String(args.query).toLowerCase();
    const options = (args.options ?? {}) as Record<string, unknown>;
    if (options.filename_only !== true) return failure({ status: 400, summary: 'Fake search only supports filename_only' });
    const matches = [...this.entries.values()]
      .filter((entry) => !entry.unindexed && nameOf(entry.path).toLowerCase().includes(query))
      .map((entry) => ({ metadata: { '.tag': 'metadata', metadata: this.metadata(entry) } }));
    return this.page(matches, offset, String(args.query), (page) => ({ matches: page }));
  }

  private page<T>(items: T[], offset: number, key: string, shape: (page: T[]) => object): Response {
    const end = offset + this.maxPageSize;
    const hasMore = end < items.length;
    return json(200, { ...shape(items.slice(offset, end)), has_more: hasMore, cursor: hasMore ? JSON.stringify([key, end]) : null });
  }

  private continueWith(cursor: unknown, next: (key: string, offset: number) => Response): Response {
    try {
      const [key, offset] = JSON.parse(String(cursor)) as [string, number];
      return next(key, offset);
    } catch {
      return failure({ status: 409, summary: 'reset/' });
    }
  }

  private metadata(entry: Entry) {
    const common = { name: nameOf(entry.path), path_lower: entry.path.toLowerCase(), path_display: entry.path, id: `id:${entry.path}` };
    if (entry.folder) return { '.tag': 'folder', ...common };
    return { '.tag': 'file', ...common, size: new TextEncoder().encode(entry.content).byteLength, content_hash: `hash-of-${entry.content}` };
  }
}

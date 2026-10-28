const folderType = 'application/vnd.google-apps.folder';
const myDriveId = 'my-drive-id';

export type FakeDriveItem = {
  id: string;
  name: string;
  parent?: string;
  folder?: boolean;
  content?: string;
  modifiedTime?: number;
  sharedWithMe?: boolean;
  trashed?: boolean;
};

export type FakeFailure = { status: number; reason?: string; headers?: Record<string, string> };

export type FakeRequest = { url: URL; token: string | undefined };

type Clause = (item: FakeDriveItem) => boolean;

const clausePatterns: [RegExp, (match: RegExpExecArray) => Clause][] = [
  [/^'((?:[^'\\]|\\.)*)' in parents/, ([, id]) => (item) => item.parent === resolveAlias(unescape(id!))],
  [/^name = '((?:[^'\\]|\\.)*)'/, ([, name]) => (item) => item.name === unescape(name!)],
  [/^mimeType (=|!=) '([^']*)'/, ([, op, type]) => (item) => (op === '=') === ((item.folder ? folderType : 'application/octet-stream') === type)],
  [/^trashed = false/, () => (item) => !item.trashed],
  [/^sharedWithMe = true/, () => (item) => !!item.sharedWithMe],
];

function unescape(value: string): string {
  return value.replace(/\\(.)/g, '$1');
}

function resolveAlias(id: string): string {
  return id === 'root' ? myDriveId : id;
}

function parseQuery(q: string): Clause[] {
  const clauses: Clause[] = [];
  let rest = q.trim();
  while (rest) {
    const parsed = clausePatterns.map(([pattern, build]) => {
      const match = pattern.exec(rest);
      return match && { length: match[0].length, clause: build(match) };
    }).find(Boolean);
    if (!parsed) throw new Error(`Unsupported query at: ${rest}`);
    clauses.push(parsed.clause);
    rest = rest.slice(parsed.length).replace(/^\s+and\s+/, '').trim();
  }
  return clauses;
}

type FieldTree = { [field: string]: FieldTree | true };

function parseFields(spec: string): FieldTree {
  let i = 0;
  const parse = (): FieldTree => {
    const tree: FieldTree = {};
    while (i < spec.length && spec[i] !== ')') {
      const name = /^\w+/.exec(spec.slice(i))?.[0];
      if (!name) throw new Error(`Bad fields at: ${spec.slice(i)}`);
      i += name.length;
      if (spec[i] === '(') {
        i++;
        tree[name] = parse();
        i++;
      } else tree[name] = true;
      while (spec[i] === ',' || spec[i] === ' ') i++;
    }
    return tree;
  };
  return parse();
}

function project(value: unknown, fields: FieldTree | true): unknown {
  if (fields === true || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((element) => project(element, fields));
  const record = value as Record<string, unknown>;
  return Object.fromEntries(Object.entries(fields).filter(([name]) => name in record).map(([name, sub]) => [name, project(record[name], sub)]));
}

const defaultFileFields = 'id,name,mimeType';

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
}

function failure({ status, reason, headers }: FakeFailure): Response {
  const message = reason ?? `HTTP ${status}`;
  return json(status, { error: { code: status, message, errors: reason ? [{ domain: 'global', reason, message }] : [] } }, headers);
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

export class FakeDrive {
  readonly requests: FakeRequest[] = [];
  readonly validTokens = new Set(['token']);
  maxPageSize = 1000;
  chunkSize = 4;
  private readonly items = new Map<string, FakeDriveItem>();
  private readonly failures: { failure: FakeFailure; matches: (url: URL) => boolean }[] = [];

  constructor(items: FakeDriveItem[] = []) {
    this.add({ id: myDriveId, name: 'My Drive', folder: true });
    for (const item of items) this.add(item);
  }

  add(item: FakeDriveItem): void {
    this.items.set(item.id, item);
  }

  failNext(failure: FakeFailure, matches: (url: URL) => boolean = () => true): void {
    this.failures.push({ failure, matches });
  }

  requestsMatching(pattern: RegExp): FakeRequest[] {
    return this.requests.filter(({ url }) => pattern.test(decodeURIComponent(url.pathname + url.search).replace(/\+/g, ' ')));
  }

  fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    if (init?.signal?.aborted) throw abortError();
    const url = new URL(input instanceof Request ? input.url : String(input));
    const token = new Headers(init?.headers).get('Authorization')?.replace(/^Bearer /, '');
    this.requests.push({ url, token });

    if (url.origin !== 'https://www.googleapis.com' || !url.pathname.startsWith('/drive/v3/files')) return failure({ status: 404 });
    if (!token || !this.validTokens.has(token)) return failure({ status: 401, reason: 'authError' });
    const failed = this.failures.findIndex(({ matches }) => matches(url));
    if (failed >= 0) return failure(this.failures.splice(failed, 1)[0]!.failure);

    const id = url.pathname.slice('/drive/v3/files/'.length);
    if (!id) return this.list(url.searchParams);
    const item = this.items.get(resolveAlias(decodeURIComponent(id)));
    if (!item) return failure({ status: 404, reason: 'notFound' });
    if (url.searchParams.get('alt') === 'media') {
      const bytes = new TextEncoder().encode(item.content ?? '');
      return new Response(streamOf(bytes, this.chunkSize, init?.signal), { headers: { 'Content-Length': String(bytes.byteLength) } });
    }
    return json(200, project(this.resource(item), parseFields(url.searchParams.get('fields') ?? defaultFileFields)));
  };

  private list(params: URLSearchParams): Response {
    let clauses: Clause[];
    try {
      clauses = parseQuery(params.get('q') ?? '');
    } catch (error) {
      return failure({ status: 400, reason: (error as Error).message });
    }
    let matches = [...this.items.values()].filter((item) => item.id !== myDriveId && clauses.every((clause) => clause(item)));
    if (params.get('orderBy') === 'modifiedTime desc') matches = matches.toSorted((a, b) => (b.modifiedTime ?? 0) - (a.modifiedTime ?? 0));
    const offset = Number(params.get('pageToken') ?? 0);
    const pageSize = Math.min(Number(params.get('pageSize') ?? 1000), this.maxPageSize);
    const page = matches.slice(offset, offset + pageSize);
    const next = offset + pageSize < matches.length ? { nextPageToken: String(offset + pageSize) } : {};
    const fields = parseFields(params.get('fields') ?? `nextPageToken,files(${defaultFileFields})`);
    return json(200, project({ ...next, files: page.map((item) => this.resource(item)) }, fields));
  }

  private resource(item: FakeDriveItem) {
    const bytes = new TextEncoder().encode(item.content ?? '');
    return {
      id: item.id,
      name: item.name,
      mimeType: item.folder ? folderType : 'application/octet-stream',
      ...(item.parent ? { parents: [item.parent] } : {}),
      ...(item.folder ? {} : { size: String(bytes.byteLength), md5Checksum: `md5-of-${item.content ?? ''}` }),
    };
  }
}

export function inMyDrive(item: Omit<FakeDriveItem, 'parent'>): FakeDriveItem {
  return { ...item, parent: myDriveId };
}

export { myDriveId };

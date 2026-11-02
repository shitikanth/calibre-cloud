import { Aborted, Network, NotFound } from '../adapter.ts';
import { createAuthorizedFetch, readJson, toStorageError } from '../http.ts';
import type { AccessTokens } from '../sign-in.ts';
import { graphFailure } from './errors.ts';

const drive = 'https://graph.microsoft.com/v1.0/me/drive';

export type DriveItem = {
  id: string;
  name: string;
  size?: number;
  cTag?: string;
  file?: object;
  folder?: object;
  parentReference?: { path?: string };
  '@microsoft.graph.downloadUrl'?: string;
};

type Page = { value: DriveItem[]; '@odata.nextLink'?: string };

function encodePath(path: string): string {
  return path.split('/').filter(Boolean).map(encodeURIComponent).join('/');
}

function itemUrl(path: string): string {
  const encoded = encodePath(path);
  return encoded === '' ? `${drive}/root` : `${drive}/root:/${encoded}`;
}

function childrenUrl(path: string): string {
  const encoded = encodePath(path);
  return encoded === '' ? `${drive}/root/children` : `${drive}/root:/${encoded}:/children`;
}

export function createGraphClient(tokens: AccessTokens) {
  const request = createAuthorizedFetch(tokens, graphFailure);
  const get = async <T>(url: string, signal: AbortSignal | undefined): Promise<T> => readJson<T>(await request({ url }, signal), signal);

  const collect = async (url: string, signal: AbortSignal | undefined, found: DriveItem[] = []): Promise<DriveItem[]> => {
    const page = await get<Page>(url, signal);
    found.push(...page.value);
    const next = page['@odata.nextLink'];
    return next === undefined ? found : collect(next, signal, found);
  };

  return {
    item: (path: string, signal: AbortSignal | undefined) => get<DriveItem>(itemUrl(path), signal),
    itemById: (id: string, signal: AbortSignal | undefined) => get<DriveItem>(`${drive}/items/${encodeURIComponent(id)}`, signal),
    children: (path: string, signal: AbortSignal | undefined) => collect(`${childrenUrl(path)}?${listing('name,folder')}`, signal),
    search: (query: string, signal: AbortSignal | undefined) =>
      collect(`${drive}/root/search(q='${encodeURIComponent(query.replaceAll("'", "''"))}')?${listing('name,file,parentReference')}`, signal),
    download,
  };
}

function listing(select: string): string {
  return new URLSearchParams({ $select: select, $top: '200' }).toString();
}

export function pathOfReference(reference: DriveItem['parentReference']): string | undefined {
  const encoded = reference?.path;
  if (encoded === undefined) return undefined;
  const colon = encoded.indexOf(':');
  if (colon < 0) return undefined;
  return encoded
    .slice(colon + 1)
    .split('/')
    .filter(Boolean)
    .map((segment) => `/${decodeSegment(segment)}`)
    .join('');
}

function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

export const downloadUrlExpired = Symbol('download URL expired');

const expiredStatuses = new Set([401, 403, 410]);

async function download(url: string, signal: AbortSignal | undefined): Promise<Response | typeof downloadUrlExpired> {
  if (signal?.aborted) throw new Aborted();
  let response: Response;
  try {
    response = await fetch(url, { signal: signal ?? null });
  } catch (error) {
    throw toStorageError(error, signal);
  }
  if (response.ok) return response;
  await response.body?.cancel();
  if (expiredStatuses.has(response.status)) return downloadUrlExpired;
  const message = `The download host answered ${response.status}`;
  throw response.status === 404 ? new NotFound(message) : new Network(message);
}

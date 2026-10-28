import { Aborted } from '../adapter.ts';
import type { AccessTokens } from '../sign-in.ts';
import { driveFailure, toStorageError } from './errors.ts';

export const sharedWithMe = 'shared-with-me';

const files = 'https://www.googleapis.com/drive/v3/files';
const folderType = 'application/vnd.google-apps.folder';
const maxRetries = 2;
const maxRetryWait = 10;

export type DriveFile = { id: string; name?: string; parents?: string[]; size?: string; md5Checksum?: string };

type FileList = { nextPageToken?: string; files?: DriveFile[] };

function quote(value: string): string {
  return `'${value.replace(/[\\']/g, '\\$&')}'`;
}

export type ItemQuery = { kind: 'folder' | 'file'; in?: string; name?: string };

export function query({ kind, in: folder, name }: ItemQuery): string {
  return [
    folder === undefined ? [] : folder === sharedWithMe ? 'sharedWithMe = true' : `${quote(folder)} in parents`,
    name === undefined ? [] : `name = ${quote(name)}`,
    `mimeType ${kind === 'folder' ? '=' : '!='} ${quote(folderType)}`,
    'trashed = false',
  ]
    .flat()
    .join(' and ');
}

export function createDriveClient(tokens: AccessTokens) {
  const send = async (url: string, token: string, signal: AbortSignal | undefined): Promise<Response> => {
    try {
      return await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: signal ?? null });
    } catch (error) {
      throw toStorageError(error, signal);
    }
  };

  const request = async (url: string, signal: AbortSignal | undefined): Promise<Response> => {
    if (signal?.aborted) throw new Aborted();
    let token = await tokens.get();
    let refreshed = false;
    for (let tries = 0; ; ) {
      const response = await send(url, token, signal);
      if (response.ok) return response;
      if (response.status === 401 && !refreshed) {
        refreshed = true;
        await response.body?.cancel();
        token = await tokens.get({ refresh: true });
        continue;
      }
      const { error, transient, retryAfter } = await driveFailure(response);
      const wait = retryAfter ?? 2 ** tries;
      if (!transient || tries >= maxRetries || wait > maxRetryWait) throw error;
      await sleep(wait * 1000, signal);
      tries++;
    }
  };

  const json = async <T>(url: string, signal: AbortSignal | undefined): Promise<T> => {
    const response = await request(url, signal);
    try {
      return (await response.json()) as T;
    } catch (error) {
      throw toStorageError(error, signal);
    }
  };

  const listPage = (params: Record<string, string>, signal: AbortSignal | undefined) =>
    json<FileList>(`${files}?${new URLSearchParams(params)}`, signal);

  return {
    media: (id: string, signal: AbortSignal | undefined) => request(`${files}/${encodeURIComponent(id)}?alt=media`, signal),
    file: (id: string, fields: string, signal: AbortSignal | undefined) =>
      json<DriveFile>(`${files}/${encodeURIComponent(id)}?${new URLSearchParams({ fields })}`, signal),
    async first(q: string, fields: string, signal: AbortSignal | undefined): Promise<DriveFile | undefined> {
      const page = await listPage({ q, fields: `files(${fields})`, orderBy: 'modifiedTime desc', pageSize: '1' }, signal);
      return page.files?.[0];
    },
    async list(q: string, fields: string, signal: AbortSignal | undefined): Promise<DriveFile[]> {
      const found: DriveFile[] = [];
      let pageToken: string | undefined;
      do {
        const page = await listPage(
          { q, fields: `nextPageToken,files(${fields})`, pageSize: '1000', ...(pageToken ? { pageToken } : {}) },
          signal,
        );
        found.push(...(page.files ?? []));
        pageToken = page.nextPageToken;
      } while (pageToken);
      return found;
    },
  };
}

function sleep(ms: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      reject(new Aborted());
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', abort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', abort, { once: true });
  });
}

import { createAuthorizedFetch, readJson } from '../http.ts';
import type { AccessTokens } from '../sign-in.ts';
import { driveFailure } from './errors.ts';

export const sharedWithMe = 'shared-with-me';

const files = 'https://www.googleapis.com/drive/v3/files';
const folderType = 'application/vnd.google-apps.folder';

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
  const request = createAuthorizedFetch(tokens, driveFailure);

  const json = async <T>(url: string, signal: AbortSignal | undefined): Promise<T> => readJson<T>(await request({ url }, signal), signal);

  const listPage = (params: Record<string, string>, signal: AbortSignal | undefined) =>
    json<FileList>(`${files}?${new URLSearchParams(params)}`, signal);

  return {
    media: (id: string, signal: AbortSignal | undefined) => request({ url: `${files}/${encodeURIComponent(id)}?alt=media` }, signal),
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

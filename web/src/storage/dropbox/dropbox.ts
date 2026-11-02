import { createAuthorizedFetch, readJson } from '../http.ts';
import type { AccessTokens } from '../sign-in.ts';
import { dropboxFailure } from './errors.ts';

const api = 'https://api.dropboxapi.com/2';
const content = 'https://content.dropboxapi.com/2';

export type DropboxMetadata = {
  '.tag': 'file' | 'folder' | 'deleted';
  name: string;
  path_lower?: string;
  path_display?: string;
  size?: number;
  content_hash?: string;
};

type SearchPage = { matches: { metadata: { '.tag': string; metadata?: DropboxMetadata } }[]; has_more: boolean; cursor?: string | null };

type FolderPage = { entries: DropboxMetadata[]; has_more: boolean; cursor: string };

type Page = { has_more: boolean; cursor?: string | null };

function headerSafeJson(value: unknown): string {
  return JSON.stringify(value).replace(/[\u007f-\uffff]/g, (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`);
}

export function createDropboxClient(tokens: AccessTokens) {
  const request = createAuthorizedFetch(tokens, dropboxFailure);

  const rpc = async <T>(endpoint: string, arg: unknown, signal: AbortSignal | undefined): Promise<T> => {
    const headers = { 'Content-Type': 'application/json' };
    return readJson<T>(await request({ url: `${api}/${endpoint}`, method: 'POST', headers, body: JSON.stringify(arg) }, signal), signal);
  };

  return {
    search: (query: string, signal: AbortSignal | undefined) =>
      collect(
        rpc<SearchPage>('files/search_v2', { query, options: { filename_only: true, max_results: 1000 } }, signal),
        (cursor) => rpc<SearchPage>('files/search/continue_v2', { cursor }, signal),
        (page) => page.matches.flatMap(({ metadata }) => (metadata.metadata ? [metadata.metadata] : [])),
      ),
    listFolder: (path: string, signal: AbortSignal | undefined) =>
      collect(
        rpc<FolderPage>('files/list_folder', { path }, signal),
        (cursor) => rpc<FolderPage>('files/list_folder/continue', { cursor }, signal),
        (page) => page.entries,
      ),
    metadata: (path: string, signal: AbortSignal | undefined) => rpc<DropboxMetadata>('files/get_metadata', { path }, signal),
    download: (path: string, signal: AbortSignal | undefined) =>
      request({ url: `${content}/files/download`, method: 'POST', headers: { 'Dropbox-API-Arg': headerSafeJson({ path }) } }, signal),
  };
}

async function collect<P extends Page, T>(first: Promise<P>, next: (cursor: string) => Promise<P>, itemsOf: (page: P) => T[]): Promise<T[]> {
  let page = await first;
  const found = itemsOf(page);
  while (page.has_more && page.cursor) {
    page = await next(page.cursor);
    found.push(...itemsOf(page));
  }
  return found;
}

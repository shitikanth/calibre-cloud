import { Aborted, isStorageError, Network, type StorageError } from '../adapter.ts';
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

export function headerSafeJson(value: unknown): string {
  return JSON.stringify(value).replace(/[\u007f-￿]/g, (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`);
}

export function toStorageError(thrown: unknown, signal: AbortSignal | undefined): StorageError {
  if (signal?.aborted) return new Aborted();
  if (isStorageError(thrown)) return thrown;
  return new Network(thrown instanceof Error ? thrown.message : String(thrown));
}

export function createDropboxClient(tokens: AccessTokens) {
  const request = async (url: string, headers: Record<string, string>, body: string | undefined, signal: AbortSignal | undefined) => {
    if (signal?.aborted) throw new Aborted();
    const token = await tokens.get();
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, ...headers },
        ...(body === undefined ? {} : { body }),
        signal: signal ?? null,
      });
    } catch (error) {
      throw toStorageError(error, signal);
    }
    if (!response.ok) throw await dropboxFailure(response);
    return response;
  };

  const rpc = async <T>(endpoint: string, arg: unknown, signal: AbortSignal | undefined): Promise<T> => {
    const response = await request(`${api}/${endpoint}`, { 'Content-Type': 'application/json' }, JSON.stringify(arg), signal);
    try {
      return (await response.json()) as T;
    } catch (error) {
      throw toStorageError(error, signal);
    }
  };

  return {
    metadata: (path: string, signal: AbortSignal | undefined) => rpc<DropboxMetadata>('files/get_metadata', { path }, signal),
    download: (path: string, signal: AbortSignal | undefined) =>
      request(`${content}/files/download`, { 'Dropbox-API-Arg': headerSafeJson({ path }) }, undefined, signal),
  };
}

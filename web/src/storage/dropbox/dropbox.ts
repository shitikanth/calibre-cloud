import { Aborted, isStorageError, Network, type StorageError } from '../adapter.ts';
import type { AccessTokens } from '../sign-in.ts';
import { dropboxFailure } from './errors.ts';

const api = 'https://api.dropboxapi.com/2';
const content = 'https://content.dropboxapi.com/2';
const maxRetries = 2;
const maxRetryWait = 10;

export type DropboxMetadata = {
  '.tag': 'file' | 'folder' | 'deleted';
  name: string;
  path_lower?: string;
  path_display?: string;
  size?: number;
  content_hash?: string;
};

type Call = { url: string; headers: Record<string, string>; body?: string };

export function headerSafeJson(value: unknown): string {
  return JSON.stringify(value).replace(/[\u007f-￿]/g, (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`);
}

export function toStorageError(thrown: unknown, signal: AbortSignal | undefined): StorageError {
  if (signal?.aborted) return new Aborted();
  if (isStorageError(thrown)) return thrown;
  return new Network(thrown instanceof Error ? thrown.message : String(thrown));
}

export function createDropboxClient(tokens: AccessTokens) {
  const send = async ({ url, headers, body }: Call, token: string, signal: AbortSignal | undefined): Promise<Response> => {
    try {
      return await fetch(url, {
        method: 'POST',
        headers: { ...headers, Authorization: `Bearer ${token}` },
        ...(body === undefined ? {} : { body }),
        signal: signal ?? null,
      });
    } catch (error) {
      throw toStorageError(error, signal);
    }
  };

  const request = async (call: Call, signal: AbortSignal | undefined): Promise<Response> => {
    if (signal?.aborted) throw new Aborted();
    let token = await tokens.get();
    let refreshed = false;
    for (let tries = 0; ; ) {
      const response = await send(call, token, signal);
      if (response.ok) return response;
      if (response.status === 401 && !refreshed) {
        refreshed = true;
        await response.body?.cancel();
        token = await tokens.get({ refresh: true });
        continue;
      }
      const { error, transient, retryAfter } = await dropboxFailure(response);
      const wait = retryAfter ?? 2 ** tries;
      if (!transient || tries >= maxRetries || wait > maxRetryWait) throw error;
      await sleep(wait * 1000, signal);
      tries++;
    }
  };

  const rpc = async <T>(endpoint: string, arg: unknown, signal: AbortSignal | undefined): Promise<T> => {
    const call = { url: `${api}/${endpoint}`, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(arg) };
    const response = await request(call, signal);
    try {
      return (await response.json()) as T;
    } catch (error) {
      throw toStorageError(error, signal);
    }
  };

  return {
    metadata: (path: string, signal: AbortSignal | undefined) => rpc<DropboxMetadata>('files/get_metadata', { path }, signal),
    download: (path: string, signal: AbortSignal | undefined) =>
      request({ url: `${content}/files/download`, headers: { 'Dropbox-API-Arg': headerSafeJson({ path }) } }, signal),
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

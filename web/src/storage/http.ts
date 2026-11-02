import { Aborted, isStorageError, Network, type ReadOptions, type StorageError } from './adapter.ts';
import type { AccessTokens } from './sign-in.ts';

export type HttpFailure = { error: StorageError; transient: boolean; retryAfter: number | undefined };

export type HttpRequest = { url: string; method?: 'GET' | 'POST'; headers?: Record<string, string>; body?: string };

const maxRetries = 2;
const maxRetryWait = 10;

export function createAuthorizedFetch(tokens: AccessTokens, failureOf: (response: Response) => Promise<HttpFailure>) {
  const send = async ({ url, method = 'GET', headers, body }: HttpRequest, token: string, signal: AbortSignal | undefined) => {
    try {
      return await fetch(url, {
        method,
        headers: { ...headers, Authorization: `Bearer ${token}` },
        ...(body === undefined ? {} : { body }),
        signal: signal ?? null,
      });
    } catch (error) {
      throw toStorageError(error, signal);
    }
  };

  return async (request: HttpRequest, signal: AbortSignal | undefined): Promise<Response> => {
    if (signal?.aborted) throw new Aborted();
    let token = await tokens.get();
    let refreshed = false;
    for (let tries = 0; ; ) {
      const response = await send(request, token, signal);
      if (response.ok) return response;
      if (response.status === 401 && !refreshed) {
        refreshed = true;
        await response.body?.cancel();
        token = await tokens.get({ refresh: true });
        continue;
      }
      const { error, transient, retryAfter } = await failureOf(response);
      const wait = retryAfter ?? 2 ** tries;
      if (!transient || tries >= maxRetries || wait > maxRetryWait) throw error;
      await sleep(wait * 1000, signal);
      tries++;
    }
  };
}

export async function readJson<T>(response: Response, signal: AbortSignal | undefined): Promise<T> {
  try {
    return (await response.json()) as T;
  } catch (error) {
    throw toStorageError(error, signal);
  }
}

export async function readBody(response: Response, size: number, { signal, onProgress }: ReadOptions): Promise<Blob> {
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let loaded = 0;
  try {
    const reader = response.body?.getReader();
    for (let chunk = await reader?.read(); chunk && !chunk.done; chunk = await reader?.read()) {
      if (signal?.aborted) throw new Aborted();
      chunks.push(chunk.value);
      loaded += chunk.value.byteLength;
      onProgress?.(loaded, size);
    }
  } catch (error) {
    throw toStorageError(error, signal);
  }
  return new Blob(chunks);
}

export function retryAfterOf(response: Response): number | undefined {
  const header = response.headers.get('Retry-After');
  if (header === null || header.trim() === '') return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds);
  const date = Date.parse(header);
  return Number.isNaN(date) ? undefined : Math.max(0, Math.ceil((date - Date.now()) / 1000));
}

export function toStorageError(thrown: unknown, signal: AbortSignal | undefined): StorageError {
  if (signal?.aborted) return new Aborted();
  if (isStorageError(thrown)) return thrown;
  return new Network(thrown instanceof Error ? thrown.message : String(thrown));
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

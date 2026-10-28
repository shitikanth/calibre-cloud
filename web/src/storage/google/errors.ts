import { Aborted, isStorageError, Network, NotFound, QuotaExceeded, ReconnectRequired, type StorageError } from '../adapter.ts';

type DriveFailure = { error: StorageError; transient: boolean; retryAfter: number | undefined };

const rateLimits = new Set(['userRateLimitExceeded', 'rateLimitExceeded']);

export async function driveFailure(response: Response): Promise<DriveFailure> {
  const { status } = response;
  const reason = await reasonOf(response);
  const retryAfter = retryAfterOf(response);
  const message = `Google Drive answered ${status}${reason ? ` ${reason}` : ''}`;
  const failure = (error: StorageError, transient = false) => ({ error, transient, retryAfter });

  if (status === 401) return failure(new ReconnectRequired(message));
  if (status === 404) return failure(new NotFound(message));
  if (status === 403 && reason === 'downloadQuotaExceeded') return failure(new QuotaExceeded(message, retryAfter));
  return failure(new Network(message), status === 429 || status >= 500 || (status === 403 && rateLimits.has(reason ?? '')));
}

async function reasonOf(response: Response): Promise<string | undefined> {
  try {
    const body = (await response.json()) as { error?: { errors?: { reason?: unknown }[] } };
    const reason = body.error?.errors?.[0]?.reason;
    return typeof reason === 'string' ? reason : undefined;
  } catch {
    return undefined;
  }
}

function retryAfterOf(response: Response): number | undefined {
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

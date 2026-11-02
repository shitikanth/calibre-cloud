import { Network, NotFound, QuotaExceeded, ReconnectRequired, type StorageError } from '../adapter.ts';
import { retryAfterOf, type HttpFailure } from '../http.ts';

const rateLimits = new Set(['userRateLimitExceeded', 'rateLimitExceeded']);

export async function driveFailure(response: Response): Promise<HttpFailure> {
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

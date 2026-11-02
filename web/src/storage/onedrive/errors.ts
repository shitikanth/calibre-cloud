import { Network, NotFound, ReconnectRequired, type StorageError } from '../adapter.ts';
import { retryAfterOf, type HttpFailure } from '../http.ts';

export async function graphFailure(response: Response): Promise<HttpFailure> {
  const { status } = response;
  const code = await codeOf(response);
  const retryAfter = retryAfterOf(response);
  const detail = code === undefined ? '' : ` ${code}`;
  const message = `Microsoft Graph answered ${status}${detail}`;
  const failure = (error: StorageError, transient = false) => ({ error, transient, retryAfter });

  if (status === 401) return failure(new ReconnectRequired(message));
  if (status === 404) return failure(new NotFound(message));
  return failure(new Network(message), status === 429 || status >= 500);
}

async function codeOf(response: Response): Promise<string | undefined> {
  try {
    const body = (await response.json()) as { error?: { code?: unknown } };
    return typeof body.error?.code === 'string' ? body.error.code : undefined;
  } catch {
    return undefined;
  }
}

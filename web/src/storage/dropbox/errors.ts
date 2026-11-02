import { Network, NotFound, ReconnectRequired, type StorageError } from '../adapter.ts';
import { retryAfterOf, type HttpFailure } from '../http.ts';

const lookupMisses = ['path/not_found/', 'path/not_file/', 'path/not_folder/'];

export async function dropboxFailure(response: Response): Promise<HttpFailure> {
  const { status } = response;
  const summary = await summaryOf(response);
  const retryAfter = retryAfterOf(response);
  const message = `Dropbox answered ${status}${summary ? ` ${summary}` : ''}`;
  const failure = (error: StorageError, transient = false) => ({ error, transient, retryAfter });

  if (status === 401) return failure(new ReconnectRequired(message));
  if (status === 409 && lookupMisses.some((miss) => summary?.startsWith(miss))) return failure(new NotFound(message));
  return failure(new Network(message), status === 429 || status >= 500);
}

async function summaryOf(response: Response): Promise<string | undefined> {
  try {
    const body = (await response.json()) as { error_summary?: unknown };
    return typeof body.error_summary === 'string' ? body.error_summary : undefined;
  } catch {
    return undefined;
  }
}

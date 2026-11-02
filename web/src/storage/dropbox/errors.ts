import { Network, NotFound, ReconnectRequired, type StorageError } from '../adapter.ts';

type DropboxFailure = { error: StorageError; transient: boolean; retryAfter: number | undefined };

const lookupMisses = ['path/not_found/', 'path/not_file/', 'path/not_folder/'];

export async function dropboxFailure(response: Response): Promise<DropboxFailure> {
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

function retryAfterOf(response: Response): number | undefined {
  const header = response.headers.get('Retry-After');
  if (header === null || header.trim() === '') return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds);
  const date = Date.parse(header);
  return Number.isNaN(date) ? undefined : Math.max(0, Math.ceil((date - Date.now()) / 1000));
}

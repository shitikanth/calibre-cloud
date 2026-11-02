import { Network, NotFound, type StorageError } from '../adapter.ts';

const lookupMisses = ['path/not_found/', 'path/not_file/', 'path/not_folder/'];

export async function dropboxFailure(response: Response): Promise<StorageError> {
  const { status } = response;
  const summary = await summaryOf(response);
  const message = `Dropbox answered ${status}${summary ? ` ${summary}` : ''}`;
  if (status === 409 && lookupMisses.some((miss) => summary?.startsWith(miss))) return new NotFound(message);
  return new Network(message);
}

async function summaryOf(response: Response): Promise<string | undefined> {
  try {
    const body = (await response.json()) as { error_summary?: unknown };
    return typeof body.error_summary === 'string' ? body.error_summary : undefined;
  } catch {
    return undefined;
  }
}

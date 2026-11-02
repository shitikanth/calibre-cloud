import type { AccessTokens } from '../sign-in.ts';

const api = 'https://api.dropboxapi.com/2';

export type DropboxMetadata = {
  '.tag': 'file' | 'folder' | 'deleted';
  name: string;
  path_lower?: string;
  path_display?: string;
  size?: number;
  content_hash?: string;
};

export function createDropboxClient(tokens: AccessTokens) {
  const rpc = async <T>(endpoint: string, arg: unknown, signal: AbortSignal | undefined): Promise<T> => {
    const token = await tokens.get();
    const response = await fetch(`${api}/${endpoint}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(arg),
      signal: signal ?? null,
    });
    return (await response.json()) as T;
  };

  return {
    metadata: (path: string, signal: AbortSignal | undefined) => rpc<DropboxMetadata>('files/get_metadata', { path }, signal),
  };
}

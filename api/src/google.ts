const authorizationEndpoint = 'https://accounts.google.com/o/oauth2/v2/auth';
const driveReadonly = 'https://www.googleapis.com/auth/drive.readonly';

export function googleAuthorizationUrl(clientId: string, redirectUri: string, state: string): string {
  const url = new URL(authorizationEndpoint);
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: driveReadonly,
    access_type: 'offline',
    prompt: 'consent',
    state,
  }).toString();
  return url.href;
}

const tokenEndpoint = 'https://oauth2.googleapis.com/token';

export interface GoogleClient {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly fetch: typeof fetch;
}

function postForm(client: GoogleClient, url: string, form: Record<string, string>): Promise<Response> {
  return client.fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(form),
  });
}

export async function exchangeCode(client: GoogleClient, code: string, redirectUri: string): Promise<string | undefined> {
  try {
    const response = await postForm(client, tokenEndpoint, {
      code,
      client_id: client.clientId,
      client_secret: client.clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    });
    if (!response.ok) return undefined;
    const body: { refresh_token?: unknown } = await response.json();
    return typeof body.refresh_token === 'string' ? body.refresh_token : undefined;
  } catch {
    return undefined;
  }
}

export type RefreshResult =
  | { readonly kind: 'ok'; readonly accessToken: string; readonly expiresInSeconds: number }
  | { readonly kind: 'revoked' }
  | { readonly kind: 'unavailable' };

export async function refreshAccessToken(client: GoogleClient, refreshToken: string): Promise<RefreshResult> {
  try {
    const response = await postForm(client, tokenEndpoint, {
      client_id: client.clientId,
      client_secret: client.clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    });
    const body: { access_token?: unknown; expires_in?: unknown; error?: unknown } = await response.json();
    if (response.status === 400 && body.error === 'invalid_grant') return { kind: 'revoked' };
    if (!response.ok || typeof body.access_token !== 'string' || typeof body.expires_in !== 'number') return { kind: 'unavailable' };
    return { kind: 'ok', accessToken: body.access_token, expiresInSeconds: body.expires_in };
  } catch {
    return { kind: 'unavailable' };
  }
}

export async function revoke(client: GoogleClient, token: string): Promise<void> {
  try {
    await postForm(client, 'https://oauth2.googleapis.com/revoke', { token });
  } catch {
    return;
  }
}

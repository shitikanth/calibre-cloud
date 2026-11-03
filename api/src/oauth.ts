export interface OAuthClient {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly fetch: typeof fetch;
}

export type RefreshResult =
  | { readonly kind: 'ok'; readonly accessToken: string; readonly expiresInSeconds: number; readonly refreshToken: string | undefined }
  | { readonly kind: 'revoked' }
  | { readonly kind: 'unavailable' };

export interface OAuthProvider {
  authorizationUrl(redirectUri: string, state: string): string;
  exchangeCode(code: string, redirectUri: string): Promise<string | undefined>;
  refresh(refreshToken: string): Promise<RefreshResult>;
  revoke(refreshToken: string): Promise<void>;
}

type CodeFlow = Omit<OAuthProvider, 'revoke'>;

export function codeFlow(
  client: OAuthClient,
  { authorizationEndpoint, tokenEndpoint, authorizationParams }: {
    authorizationEndpoint: string;
    tokenEndpoint: string;
    authorizationParams: Record<string, string>;
  },
): CodeFlow {
  return {
    authorizationUrl(redirectUri, state) {
      const url = new URL(authorizationEndpoint);
      url.search = new URLSearchParams({
        client_id: client.clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        ...authorizationParams,
        state,
      }).toString();
      return url.href;
    },
    exchangeCode: (code, redirectUri) => exchangeCode(client, tokenEndpoint, code, redirectUri),
    refresh: (refreshToken) => refreshAccessToken(client, tokenEndpoint, refreshToken),
  };
}

export function postForm(client: OAuthClient, url: string, form: Record<string, string>): Promise<Response> {
  return client.fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(form),
  });
}

async function exchangeCode(
  client: OAuthClient,
  tokenEndpoint: string,
  code: string,
  redirectUri: string,
): Promise<string | undefined> {
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

async function refreshAccessToken(client: OAuthClient, tokenEndpoint: string, refreshToken: string): Promise<RefreshResult> {
  try {
    const response = await postForm(client, tokenEndpoint, {
      client_id: client.clientId,
      client_secret: client.clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    });
    const body: { access_token?: unknown; expires_in?: unknown; refresh_token?: unknown; error?: unknown } = await response.json();
    if (response.status === 400 && body.error === 'invalid_grant') return { kind: 'revoked' };
    if (!response.ok || typeof body.access_token !== 'string' || typeof body.expires_in !== 'number') return { kind: 'unavailable' };
    const rotated = typeof body.refresh_token === 'string' ? body.refresh_token : undefined;
    return { kind: 'ok', accessToken: body.access_token, expiresInSeconds: body.expires_in, refreshToken: rotated };
  } catch {
    return { kind: 'unavailable' };
  }
}

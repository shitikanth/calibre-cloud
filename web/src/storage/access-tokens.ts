import { Network, ReconnectRequired } from './adapter.ts';
import type { AccessTokens } from './sign-in.ts';

export interface AccessTokenClient extends AccessTokens {
  signOut(): Promise<void>;
}

export type AccessTokenClientOptions = { fetch?: typeof fetch; now?: () => number };

type Token = { accessToken: string; expiresAt: number };

const renewBefore = 2 * 60 * 1000;

export function createAccessTokens({
  fetch: send = (input, init) => fetch(input, init),
  now = Date.now,
}: AccessTokenClientOptions = {}): AccessTokenClient {
  let current: Token | undefined;
  let refreshing: Promise<string> | undefined;
  let signIn = 0;

  async function refresh(): Promise<string> {
    const started = signIn;
    let response: Response;
    try {
      response = await send('/api/auth/refresh', { method: 'POST' });
    } catch (error) {
      throw new Network(error instanceof Error ? error.message : String(error));
    }
    if (response.status === 401) throw new ReconnectRequired('Sign-in has ended');
    if (!response.ok) throw new Network(`Token refresh failed with ${response.status}`);
    const token = parseToken(await response.json().catch(() => undefined));
    if (!token) throw new Network('Token refresh returned no token');
    if (started === signIn) current = token;
    return token.accessToken;
  }

  return {
    get({ refresh: force = false } = {}) {
      if (refreshing) return refreshing;
      if (!force && current && now() < current.expiresAt - renewBefore) return Promise.resolve(current.accessToken);
      const pending = refresh().finally(() => {
        if (refreshing === pending) refreshing = undefined;
      });
      refreshing = pending;
      return pending;
    },
    async signOut() {
      current = undefined;
      refreshing = undefined;
      signIn += 1;
      await send('/api/auth/signout', { method: 'POST' }).catch(() => undefined);
    },
  };
}

function parseToken(body: unknown): Token | undefined {
  if (typeof body !== 'object' || body === null) return undefined;
  const { accessToken, expiresAt } = body as Record<string, unknown>;
  return typeof accessToken === 'string' && typeof expiresAt === 'number' ? { accessToken, expiresAt } : undefined;
}

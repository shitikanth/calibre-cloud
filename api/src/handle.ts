import { Hono, type Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { toBase64Url } from './base64url.ts';
import type { Config } from './config.ts';
import { exchangeCode, googleAuthorizationUrl, refreshAccessToken, revoke, type GoogleClient } from './google.ts';
import { sameOriginPath } from './return-path.ts';
import { importCookieKey, seal, unseal } from './seal.ts';

const stateCookie = 'signin_state';
const signInCookie = 'signin';
const authPath = '/api/auth';
const maxCookieAge = 400 * 24 * 60 * 60;
const stateCookieOptions = { path: authPath, httpOnly: true, secure: true, sameSite: 'Lax' } as const;
const signInCookieOptions = { path: authPath, httpOnly: true, secure: true, sameSite: 'Strict' } as const;

interface SignInState {
  state: string;
  returnTo: string;
}

interface SignIn {
  provider: 'google';
  refreshToken: string;
}

function isSignIn(value: unknown): value is SignIn {
  const candidate = value as Partial<SignIn> | undefined;
  return candidate?.provider === 'google' && typeof candidate.refreshToken === 'string';
}

function isSignInState(value: unknown): value is SignInState {
  const candidate = value as Partial<SignInState> | undefined;
  return typeof candidate?.state === 'string' && typeof candidate.returnTo === 'string';
}

function requestOrigin(c: Context): string {
  return new URL(c.req.url).origin;
}

function googleCallbackUri(origin: string): string {
  return `${origin}${authPath}/google/callback`;
}

interface ReadyConfig {
  readonly google: GoogleClient;
  readonly key: CryptoKey;
}

type AuthContext = Context<{ Variables: ReadyConfig }>;

async function ready(config: Config): Promise<ReadyConfig | { readonly missing: string[] }> {
  const { googleClientId: clientId, googleClientSecret: clientSecret } = config;
  const key = config.cookieKey ? await importCookieKey(config.cookieKey) : undefined;
  if (!clientId || !clientSecret || !key) {
    const present = { googleClientId: clientId, googleClientSecret: clientSecret, cookieKey: key };
    return { missing: Object.entries(present).flatMap(([name, value]) => (value ? [] : [name])) };
  }
  return {
    google: {
      clientId,
      clientSecret,
      fetch: config.fetch ?? ((input, init) => fetch(input, init)),
    },
    key,
  };
}

async function keepSignIn(c: AuthContext, signIn: SignIn) {
  setCookie(c, signInCookie, await seal(c.var.key, signInCookie, signIn), { ...signInCookieOptions, maxAge: maxCookieAge });
}

async function savedSignIn(c: AuthContext): Promise<SignIn | undefined> {
  const sealed = getCookie(c, signInCookie);
  if (sealed === undefined) return undefined;
  const signIn = await unseal(c.var.key, signInCookie, sealed);
  return isSignIn(signIn) ? signIn : undefined;
}

function signInError(c: Context, returnTo: string, reason: 'denied' | 'failed' = 'failed') {
  return c.redirect(`${requestOrigin(c)}${returnTo}#signin-error=${reason}`, 302);
}

function app(config: Config) {
  return new Hono<{ Variables: ReadyConfig }>()
    .use(`${authPath}/*`, async (c, next) => {
      c.header('cache-control', 'no-store');
      if (c.req.method === 'POST' && c.req.header('origin') !== requestOrigin(c)) return c.json({ error: 'forbidden' }, 403);
      const prepared = await ready(config);
      if ('missing' in prepared) {
        console.error('Sign-in is not configured; missing', prepared.missing);
        if (c.req.method === 'GET') return signInError(c, sameOriginPath(requestOrigin(c), c.req.query('return')) ?? '/');
        return c.json({ error: 'not-configured', missing: prepared.missing }, 500);
      }
      c.set('google', prepared.google);
      c.set('key', prepared.key);
      await next();
    })
    .get(`${authPath}/google/start`, async (c) => {
      const origin = requestOrigin(c);
      const returnTo = sameOriginPath(origin, c.req.query('return'));
      if (returnTo === undefined) return signInError(c, '/');
      const state = toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
      const sealed = await seal(c.var.key, stateCookie, { state, returnTo } satisfies SignInState);
      setCookie(c, stateCookie, sealed, { ...stateCookieOptions, maxAge: 600 });
      return c.redirect(googleAuthorizationUrl(c.var.google.clientId, googleCallbackUri(origin), state), 302);
    })
    .get(`${authPath}/google/callback`, async (c) => {
      const origin = requestOrigin(c);
      const sealedState = getCookie(c, stateCookie);
      deleteCookie(c, stateCookie, stateCookieOptions);
      const saved = sealedState === undefined ? undefined : await unseal(c.var.key, stateCookie, sealedState);
      const returnTo = (isSignInState(saved) && sameOriginPath(origin, saved.returnTo)) || '/';
      const fail = (reason: 'denied' | 'failed') => signInError(c, returnTo, reason);
      if (!isSignInState(saved) || saved.state !== c.req.query('state')) return fail('failed');
      const error = c.req.query('error');
      if (error !== undefined) return fail(error === 'access_denied' ? 'denied' : 'failed');
      const code = c.req.query('code');
      if (code === undefined) return fail('failed');
      const refreshToken = await exchangeCode(c.var.google, code, googleCallbackUri(origin));
      if (refreshToken === undefined) return fail('failed');
      await keepSignIn(c, { provider: 'google', refreshToken });
      return c.redirect(`${origin}${returnTo}`, 302);
    })
    .post(`${authPath}/refresh`, async (c) => {
      const signIn = await savedSignIn(c);
      if (signIn === undefined) return c.json({ error: 'reconnect' }, 401);
      const result = await refreshAccessToken(c.var.google, signIn.refreshToken);
      if (result.kind === 'revoked') return c.json({ error: 'reconnect' }, 401);
      if (result.kind === 'unavailable') return c.json({ error: 'network' }, 502);
      await keepSignIn(c, signIn);
      return c.json({ accessToken: result.accessToken, expiresAt: Date.now() + result.expiresInSeconds * 1000 });
    })
    .post(`${authPath}/signout`, async (c) => {
      const signIn = await savedSignIn(c);
      if (signIn !== undefined) await revoke(c.var.google, signIn.refreshToken);
      deleteCookie(c, signInCookie, signInCookieOptions);
      return c.body(null, 204);
    });
}

export function handle(request: Request, config: Config): Promise<Response> {
  return Promise.resolve(app(config).fetch(request));
}

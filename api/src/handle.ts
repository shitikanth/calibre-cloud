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

interface Settings {
  readonly google: GoogleClient;
  readonly key: CryptoKey;
}

type AuthContext = Context<{ Variables: Settings }>;

async function settingsFrom(config: Config): Promise<Settings | { readonly missing: string[] }> {
  const key = config.cookieKey ? await importCookieKey(config.cookieKey) : undefined;
  const missing = [
    ...(config.googleClientId ? [] : ['googleClientId']),
    ...(config.googleClientSecret ? [] : ['googleClientSecret']),
    ...(key ? [] : ['cookieKey']),
  ];
  if (!config.googleClientId || !config.googleClientSecret || !key) return { missing };
  return {
    google: {
      clientId: config.googleClientId,
      clientSecret: config.googleClientSecret,
      fetch: config.fetch ?? ((input, init) => fetch(input, init)),
    },
    key,
  };
}

async function keepSignIn(c: AuthContext, signIn: SignIn) {
  setCookie(c, signInCookie, await seal(c.var.key, signInCookie, signIn), {
    maxAge: maxCookieAge,
    path: authPath,
    httpOnly: true,
    secure: true,
    sameSite: 'Strict',
  });
}

async function savedSignIn(c: AuthContext): Promise<SignIn | undefined> {
  const sealed = getCookie(c, signInCookie);
  if (sealed === undefined) return undefined;
  const signIn = await unseal(c.var.key, signInCookie, sealed);
  return isSignIn(signIn) ? signIn : undefined;
}

function app(config: Config) {
  return new Hono<{ Variables: Settings }>()
    .use('/api/auth/*', async (c, next) => {
      c.header('cache-control', 'no-store');
      if (c.req.method === 'POST' && c.req.header('origin') !== requestOrigin(c)) return c.json({ error: 'forbidden' }, 403);
      const settings = await settingsFrom(config);
      if ('missing' in settings) return c.json({ error: 'not-configured', missing: settings.missing }, 500);
      c.set('google', settings.google);
      c.set('key', settings.key);
      await next();
    })
    .get('/api/auth/google/start', async (c) => {
      const origin = requestOrigin(c);
      const returnTo = sameOriginPath(origin, c.req.query('return'));
      if (returnTo === undefined) return c.json({ error: 'bad-return' }, 400);
      const state = toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
      setCookie(c, stateCookie, await seal(c.var.key, stateCookie, { state, returnTo } satisfies SignInState), {
        maxAge: 600,
        path: authPath,
        httpOnly: true,
        secure: true,
        sameSite: 'Lax',
      });
      return c.redirect(googleAuthorizationUrl(c.var.google.clientId, `${origin}/api/auth/google/callback`, state), 302);
    })
    .get('/api/auth/google/callback', async (c) => {
      const origin = requestOrigin(c);
      const sealedState = getCookie(c, stateCookie);
      deleteCookie(c, stateCookie, { path: authPath, httpOnly: true, secure: true, sameSite: 'Lax' });
      const saved = sealedState === undefined ? undefined : await unseal(c.var.key, stateCookie, sealedState);
      const returnTo = (isSignInState(saved) && sameOriginPath(origin, saved.returnTo)) || '/';
      const fail = (reason: 'denied' | 'failed') => c.redirect(`${origin}${returnTo}#signin-error=${reason}`, 302);
      if (!isSignInState(saved) || saved.state !== c.req.query('state')) return fail('failed');
      const error = c.req.query('error');
      if (error !== undefined) return fail(error === 'access_denied' ? 'denied' : 'failed');
      const code = c.req.query('code');
      if (code === undefined) return fail('failed');
      const refreshToken = await exchangeCode(c.var.google, code, `${origin}/api/auth/google/callback`);
      if (refreshToken === undefined) return fail('failed');
      await keepSignIn(c, { provider: 'google', refreshToken });
      return c.redirect(`${origin}${returnTo}`, 302);
    })
    .post('/api/auth/refresh', async (c) => {
      const signIn = await savedSignIn(c);
      if (signIn === undefined) return c.json({ error: 'reconnect' }, 401);
      const result = await refreshAccessToken(c.var.google, signIn.refreshToken);
      if (result.kind === 'revoked') return c.json({ error: 'reconnect' }, 401);
      if (result.kind === 'unavailable') return c.json({ error: 'network' }, 502);
      await keepSignIn(c, signIn);
      return c.json({ accessToken: result.accessToken, expiresAt: Date.now() + result.expiresInSeconds * 1000 });
    })
    .post('/api/auth/signout', async (c) => {
      const signIn = await savedSignIn(c);
      if (signIn !== undefined) await revoke(c.var.google, signIn.refreshToken);
      deleteCookie(c, signInCookie, { path: authPath, httpOnly: true, secure: true, sameSite: 'Strict' });
      return c.body(null, 204);
    });
}

export function handle(request: Request, config: Config): Promise<Response> {
  return Promise.resolve(app(config).fetch(request));
}

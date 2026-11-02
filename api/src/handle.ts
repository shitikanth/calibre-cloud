import { Hono, type Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { toBase64Url } from './base64url.ts';
import type { Config } from './config.ts';
import { dropboxProvider } from './dropbox.ts';
import { googleProvider } from './google.ts';
import type { OAuthClient, SignInProvider } from './oauth.ts';
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
  provider: ProviderId;
}

interface SignIn {
  provider: ProviderId;
  refreshToken: string;
}

function isSignIn(value: unknown): value is SignIn {
  const candidate = value as Partial<SignIn> | undefined;
  return isProviderId(candidate?.provider) && typeof candidate.refreshToken === 'string';
}

function isSignInState(value: unknown): value is SignInState {
  const candidate = value as Partial<SignInState> | undefined;
  return typeof candidate?.state === 'string' && typeof candidate.returnTo === 'string' && isProviderId(candidate.provider);
}

function requestOrigin(c: Context): string {
  return new URL(c.req.url).origin;
}

function callbackUri(origin: string, provider: ProviderId): string {
  return `${origin}${authPath}/${provider}/callback`;
}

const providers = {
  google: { clientId: 'googleClientId', clientSecret: 'googleClientSecret', create: googleProvider },
  dropbox: { clientId: 'dropboxClientId', clientSecret: 'dropboxClientSecret', create: dropboxProvider },
} as const satisfies Record<string, { clientId: keyof Config; clientSecret: keyof Config; create(client: OAuthClient): SignInProvider }>;

type ProviderId = keyof typeof providers;

function isProviderId(value: unknown): value is ProviderId {
  return typeof value === 'string' && Object.hasOwn(providers, value);
}

const providerParam = `:provider{${Object.keys(providers).join('|')}}`;

function configuredProvider(config: Config, id: ProviderId): SignInProvider | { readonly missing: string[] } {
  const { clientId: idName, clientSecret: secretName, create } = providers[id];
  const clientId = config[idName];
  const clientSecret = config[secretName];
  if (!clientId || !clientSecret) return { missing: [idName, secretName].filter((name) => !config[name]) };
  return create({ clientId, clientSecret, fetch: config.fetch ?? ((input, init) => fetch(input, init)) });
}

type AuthContext = Context<{ Variables: { key: CryptoKey } }>;

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

function notConfigured(c: Context, missing: string[], returnTo = sameOriginPath(requestOrigin(c), c.req.query('return')) ?? '/') {
  console.error('Sign-in is not configured; missing', missing);
  if (c.req.method === 'GET') return signInError(c, returnTo);
  return c.json({ error: 'not-configured', missing }, 500);
}

function app(config: Config) {
  return new Hono<{ Variables: { key: CryptoKey } }>()
    .use(`${authPath}/*`, async (c, next) => {
      c.header('cache-control', 'no-store');
      if (c.req.method === 'POST' && c.req.header('origin') !== requestOrigin(c)) return c.json({ error: 'forbidden' }, 403);
      const key = config.cookieKey ? await importCookieKey(config.cookieKey) : undefined;
      if (!key) return notConfigured(c, ['cookieKey']);
      c.set('key', key);
      await next();
    })
    .get(`${authPath}/${providerParam}/start`, async (c) => {
      const id = c.req.param('provider') as ProviderId;
      const provider = configuredProvider(config, id);
      if ('missing' in provider) return notConfigured(c, provider.missing);
      const origin = requestOrigin(c);
      const returnTo = sameOriginPath(origin, c.req.query('return'));
      if (returnTo === undefined) return signInError(c, '/');
      const state = toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
      const sealed = await seal(c.var.key, stateCookie, { state, returnTo, provider: id } satisfies SignInState);
      setCookie(c, stateCookie, sealed, { ...stateCookieOptions, maxAge: 600 });
      return c.redirect(provider.authorizationUrl(callbackUri(origin, id), state), 302);
    })
    .get(`${authPath}/${providerParam}/callback`, async (c) => {
      const id = c.req.param('provider') as ProviderId;
      const origin = requestOrigin(c);
      const sealedState = getCookie(c, stateCookie);
      deleteCookie(c, stateCookie, stateCookieOptions);
      const saved = sealedState === undefined ? undefined : await unseal(c.var.key, stateCookie, sealedState);
      const returnTo = (isSignInState(saved) && sameOriginPath(origin, saved.returnTo)) || '/';
      const fail = (reason: 'denied' | 'failed') => signInError(c, returnTo, reason);
      if (!isSignInState(saved) || saved.provider !== id || saved.state !== c.req.query('state')) return fail('failed');
      const error = c.req.query('error');
      if (error !== undefined) return fail(error === 'access_denied' ? 'denied' : 'failed');
      const code = c.req.query('code');
      if (code === undefined) return fail('failed');
      const provider = configuredProvider(config, id);
      if ('missing' in provider) return notConfigured(c, provider.missing, returnTo);
      const refreshToken = await provider.exchangeCode(code, callbackUri(origin, id));
      if (refreshToken === undefined) return fail('failed');
      await keepSignIn(c, { provider: id, refreshToken });
      return c.redirect(`${origin}${returnTo}`, 302);
    })
    .post(`${authPath}/refresh`, async (c) => {
      const signIn = await savedSignIn(c);
      if (signIn === undefined) return c.json({ error: 'reconnect' }, 401);
      const provider = configuredProvider(config, signIn.provider);
      if ('missing' in provider) return notConfigured(c, provider.missing);
      const result = await provider.refresh(signIn.refreshToken);
      if (result.kind === 'revoked') return c.json({ error: 'reconnect' }, 401);
      if (result.kind === 'unavailable') return c.json({ error: 'network' }, 502);
      await keepSignIn(c, signIn);
      return c.json({ accessToken: result.accessToken, expiresAt: Date.now() + result.expiresInSeconds * 1000 });
    })
    .post(`${authPath}/signout`, async (c) => {
      const signIn = await savedSignIn(c);
      const provider = signIn && configuredProvider(config, signIn.provider);
      if (provider && 'missing' in provider) console.error('Sign-out cannot revoke the grant; missing', provider.missing);
      else if (signIn && provider) await provider.revoke(signIn.refreshToken);
      deleteCookie(c, signInCookie, signInCookieOptions);
      return c.body(null, 204);
    });
}

export function handle(request: Request, config: Config): Promise<Response> {
  return Promise.resolve(app(config).fetch(request));
}

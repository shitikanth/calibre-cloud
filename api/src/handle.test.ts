import { afterEach, describe, expect, test, vi } from 'vitest';
import { handle, type Config } from './index.ts';

const origin = 'https://app.example';

const config: Config = {
  googleClientId: 'client-id',
  googleClientSecret: 'client-secret',
  cookieKey: btoa(String.fromCharCode(...new Uint8Array(32).fill(7))),
};

interface SetCookie {
  name: string;
  value: string;
  attributes: Record<string, string>;
}

function setCookies(response: Response): SetCookie[] {
  return response.headers.getSetCookie().map((header) => {
    const [pair = '', ...rest] = header.split(';').map((part) => part.trim());
    const eq = pair.indexOf('=');
    const attributes = Object.fromEntries(
      rest.map((attribute) => {
        const [key = '', value = ''] = attribute.split('=');
        return [key.toLowerCase(), value];
      }),
    );
    return { name: pair.slice(0, eq), value: pair.slice(eq + 1), attributes };
  });
}

interface GoogleRequest {
  url: string;
  form: Record<string, string>;
}

type GoogleReply = (request: GoogleRequest) => Response | Promise<Response>;

function fakeGoogle(reply: GoogleReply) {
  const requests: GoogleRequest[] = [];
  const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    const recorded = { url: request.url, form: Object.fromEntries(new URLSearchParams(await request.text())) };
    requests.push(recorded);
    return reply(recorded);
  };
  return { requests, config: { ...config, fetch } satisfies Config };
}

const tokenEndpoint = 'https://oauth2.googleapis.com/token';

function cookieHeader(...cookies: (SetCookie | undefined)[]): string {
  return cookies.flatMap((c) => (c ? [`${c.name}=${c.value}`] : [])).join('; ');
}

async function startSignIn(returnPath = '/books/1') {
  const response = await handle(
    new Request(`${origin}/api/auth/google/start?return=${encodeURIComponent(returnPath)}`),
    config,
  );
  return {
    state: new URL(response.headers.get('location')!).searchParams.get('state')!,
    stateCookie: setCookies(response).find((c) => c.name === 'signin_state'),
  };
}

function callbackRequest(query: string, cookie: string): Request {
  return new Request(`${origin}/api/auth/google/callback?${query}`, { headers: { cookie } });
}

async function signIn(refreshToken = 'refresh-1'): Promise<SetCookie> {
  const google = fakeGoogle(() => Response.json({ access_token: 'a', expires_in: 3599, refresh_token: refreshToken }));
  const { state, stateCookie } = await startSignIn();
  const response = await handle(callbackRequest(`state=${state}&code=c`, cookieHeader(stateCookie)), google.config);
  return setCookies(response).find((c) => c.name === 'signin')!;
}

function post(path: string, cookie = '', requestOrigin: string | null = origin): Request {
  const headers = new Headers({ cookie });
  if (requestOrigin !== null) headers.set('origin', requestOrigin);
  return new Request(`${origin}${path}`, { method: 'POST', headers });
}

describe('GET /api/auth/google/start', () => {
  test('redirects to Google for a read-only Drive grant that always returns a refresh token', async () => {
    const response = await handle(new Request(`${origin}/api/auth/google/start?return=/books/1`), config);

    expect(response.status).toBe(302);
    const location = new URL(response.headers.get('location')!);
    expect(location.origin + location.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(Object.fromEntries(location.searchParams)).toEqual({
      client_id: 'client-id',
      redirect_uri: `${origin}/api/auth/google/callback`,
      response_type: 'code',
      scope: 'https://www.googleapis.com/auth/drive.readonly',
      access_type: 'offline',
      prompt: 'consent',
      state: expect.stringMatching(/^[\w-]{20,}$/),
    });
  });

  test('sets a short-lived state cookie that Google\'s redirect back can carry', async () => {
    const response = await handle(new Request(`${origin}/api/auth/google/start`), config);

    const cookie = setCookies(response).find((c) => c.name === 'signin_state');
    expect(cookie?.attributes).toEqual({ 'max-age': '600', path: '/api/auth', httponly: '', secure: '', samesite: 'Lax' });
  });

  test.each([
    ['a protocol-relative URL', '//evil.example/x'],
    ['a backslash path browsers read as protocol-relative', '/\\evil.example/x'],
    ['a path that becomes protocol-relative once URL parsing drops a tab', '/\t/evil.example/x'],
    ['an absolute URL', 'https://evil.example/x'],
    ['a relative path', 'books/1'],
  ])('rejects %s as the return path', async (_case, returnPath) => {
    const response = await handle(
      new Request(`${origin}/api/auth/google/start?return=${encodeURIComponent(returnPath)}`),
      config,
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'bad-return' });
    expect(setCookies(response)).toEqual([]);
  });
});

describe('GET /api/auth/google/callback', () => {
  test('exchanges the code, keeps the refresh token in a long-lived cookie, and returns to the app', async () => {
    const google = fakeGoogle(() => Response.json({ access_token: 'access-1', expires_in: 3599, refresh_token: 'refresh-1' }));
    const { state, stateCookie } = await startSignIn('/books/1?tab=formats');

    const response = await handle(callbackRequest(`state=${state}&code=the-code`, cookieHeader(stateCookie)), google.config);

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(`${origin}/books/1?tab=formats`);
    expect(google.requests).toEqual([
      {
        url: tokenEndpoint,
        form: {
          code: 'the-code',
          client_id: 'client-id',
          client_secret: 'client-secret',
          redirect_uri: `${origin}/api/auth/google/callback`,
          grant_type: 'authorization_code',
        },
      },
    ]);
    const cookies = setCookies(response);
    expect(cookies.find((c) => c.name === 'signin')?.attributes).toEqual({
      'max-age': '34560000',
      path: '/api/auth',
      httponly: '',
      secure: '',
      samesite: 'Strict',
    });
    expect(cookies.find((c) => c.name === 'signin')?.value).not.toContain('refresh-1');
    expect(cookies.find((c) => c.name === 'signin_state')).toMatchObject({ value: '', attributes: { 'max-age': '0', path: '/api/auth' } });
  });

  test('returns to the app with a denied error when the user declines, without calling Google', async () => {
    const google = fakeGoogle(() => Response.json({}));
    const { state, stateCookie } = await startSignIn('/books/1');

    const response = await handle(callbackRequest(`state=${state}&error=access_denied`, cookieHeader(stateCookie)), google.config);

    expect(response.headers.get('location')).toBe(`${origin}/books/1#signin-error=denied`);
    expect(google.requests).toEqual([]);
    expect(setCookies(response).map((c) => c.name)).toEqual(['signin_state']);
  });

  test('returns to the app with a failed error when Google reports another error', async () => {
    const google = fakeGoogle(() => Response.json({}));
    const { state, stateCookie } = await startSignIn('/books/1');

    const response = await handle(callbackRequest(`state=${state}&error=server_error`, cookieHeader(stateCookie)), google.config);

    expect(response.headers.get('location')).toBe(`${origin}/books/1#signin-error=failed`);
    expect(google.requests).toEqual([]);
  });

  test('rejects a state that does not match the cookie, keeping the cookie\'s return path', async () => {
    const google = fakeGoogle(() => Response.json({ access_token: 'a', expires_in: 3599, refresh_token: 'r' }));
    const { stateCookie } = await startSignIn('/books/1');
    const other = await startSignIn('/books/2');

    const response = await handle(callbackRequest(`state=${other.state}&code=c`, cookieHeader(stateCookie)), google.config);

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(`${origin}/books/1#signin-error=failed`);
    expect(google.requests).toEqual([]);
    expect(setCookies(response).map((c) => c.name)).toEqual(['signin_state']);
  });

  test.each([
    ['no state cookie', ''],
    ['a garbled state cookie', 'signin_state=not-a-sealed-value'],
  ])('fails back to the app root with %s', async (_case, cookie) => {
    const google = fakeGoogle(() => Response.json({ access_token: 'a', expires_in: 3599, refresh_token: 'r' }));
    const { state } = await startSignIn('/books/1');

    const response = await handle(callbackRequest(`state=${state}&code=c`, cookie), google.config);

    expect(response.headers.get('location')).toBe(`${origin}/#signin-error=failed`);
    expect(google.requests).toEqual([]);
  });

  test.each([
    ['rejects the code', () => Response.json({ error: 'invalid_grant' }, { status: 400 })],
    ['answers without a refresh token', () => Response.json({ access_token: 'a', expires_in: 3599 })],
    ['cannot be reached', () => Promise.reject(new TypeError('fetch failed'))],
  ])('fails back to the app when Google %s', async (_case, reply) => {
    const google = fakeGoogle(reply);
    const { state, stateCookie } = await startSignIn('/books/1');

    const response = await handle(callbackRequest(`state=${state}&code=c`, cookieHeader(stateCookie)), google.config);

    expect(response.headers.get('location')).toBe(`${origin}/books/1#signin-error=failed`);
    expect(setCookies(response).map((c) => c.name)).toEqual(['signin_state']);
  });
});

describe('POST /api/auth/refresh', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  test('returns a fresh access token for the signed-in user and renews the cookie', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-28T12:00:00Z'));
    const google = fakeGoogle(() => Response.json({ access_token: 'access-2', expires_in: 3599, token_type: 'Bearer' }));

    const response = await handle(post('/api/auth/refresh', cookieHeader(await signIn('refresh-1'))), google.config);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ accessToken: 'access-2', expiresAt: Date.parse('2026-10-28T12:59:59Z') });
    expect(google.requests).toEqual([
      {
        url: tokenEndpoint,
        form: { client_id: 'client-id', client_secret: 'client-secret', refresh_token: 'refresh-1', grant_type: 'refresh_token' },
      },
    ]);
    expect(setCookies(response).find((c) => c.name === 'signin')?.attributes).toEqual({
      'max-age': '34560000',
      path: '/api/auth',
      httponly: '',
      secure: '',
      samesite: 'Strict',
    });
  });

  test('the renewed cookie keeps working', async () => {
    const google = fakeGoogle(() => Response.json({ access_token: 'access-2', expires_in: 3599 }));
    const first = await handle(post('/api/auth/refresh', cookieHeader(await signIn('refresh-1'))), google.config);
    const renewed = setCookies(first).find((c) => c.name === 'signin');

    const second = await handle(post('/api/auth/refresh', cookieHeader(renewed)), google.config);

    expect(second.status).toBe(200);
    expect(google.requests.map((r) => r.form.refresh_token)).toEqual(['refresh-1', 'refresh-1']);
  });

  test.each([
    ['there is no sign-in cookie', () => Promise.resolve('')],
    ['the cookie is garbled', () => Promise.resolve('signin=garbage')],
    ['the cookie was sealed with another key', async () => {
      const otherKey = { ...config, cookieKey: btoa(String.fromCharCode(...new Uint8Array(32).fill(9))) };
      const google = fakeGoogle(() => Response.json({ access_token: 'a', expires_in: 1, refresh_token: 'r' }));
      const start = await handle(new Request(`${origin}/api/auth/google/start`), otherKey);
      const state = new URL(start.headers.get('location')!).searchParams.get('state')!;
      const callback = await handle(
        callbackRequest(`state=${state}&code=c`, cookieHeader(setCookies(start)[0])),
        { ...google.config, cookieKey: otherKey.cookieKey },
      );
      return cookieHeader(setCookies(callback).find((c) => c.name === 'signin'));
    }],
    ['the state cookie is sent in its place', async () => cookieHeader((await startSignIn()).stateCookie).replace('signin_state=', 'signin=')],
  ])('asks the user to reconnect when %s', async (_case, cookie) => {
    const google = fakeGoogle(() => Response.json({ access_token: 'a', expires_in: 1 }));

    const response = await handle(post('/api/auth/refresh', await cookie()), google.config);

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'reconnect' });
    expect(google.requests).toEqual([]);
  });

  test('asks the user to reconnect when Google no longer honours the grant', async () => {
    const google = fakeGoogle(() => Response.json({ error: 'invalid_grant', error_description: 'Token has been expired or revoked.' }, { status: 400 }));

    const response = await handle(post('/api/auth/refresh', cookieHeader(await signIn())), google.config);

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'reconnect' });
  });

  test.each([
    ['cannot be reached', () => Promise.reject(new TypeError('fetch failed'))],
    ['fails', () => new Response('oops', { status: 500 })],
    ['rejects our client', () => Response.json({ error: 'invalid_client' }, { status: 401 })],
    ['answers with something unexpected', () => Response.json({ nope: true })],
  ])('reports a network error when Google %s', async (_case, reply) => {
    const google = fakeGoogle(reply);

    const response = await handle(post('/api/auth/refresh', cookieHeader(await signIn())), google.config);

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: 'network' });
  });
});

describe('POST /api/auth/signout', () => {
  test('revokes the grant at Google and clears the sign-in cookie', async () => {
    const google = fakeGoogle(() => new Response(null, { status: 200 }));

    const response = await handle(post('/api/auth/signout', cookieHeader(await signIn('refresh-1'))), google.config);

    expect(response.status).toBe(204);
    expect(google.requests).toEqual([{ url: 'https://oauth2.googleapis.com/revoke', form: { token: 'refresh-1' } }]);
    expect(setCookies(response).find((c) => c.name === 'signin')).toMatchObject({
      value: '',
      attributes: { 'max-age': '0', path: '/api/auth' },
    });
  });

  test.each([
    ['cannot be reached', () => Promise.reject(new TypeError('fetch failed'))],
    ['rejects the token', () => Response.json({ error: 'invalid_token' }, { status: 400 })],
  ])('still signs out when Google %s', async (_case, reply) => {
    const google = fakeGoogle(reply);

    const response = await handle(post('/api/auth/signout', cookieHeader(await signIn())), google.config);

    expect(response.status).toBe(204);
    expect(setCookies(response).find((c) => c.name === 'signin')?.attributes['max-age']).toBe('0');
  });

  test.each([
    ['no sign-in cookie', ''],
    ['a garbled sign-in cookie', 'signin=garbage'],
  ])('succeeds without calling Google when there is %s', async (_case, cookie) => {
    const google = fakeGoogle(() => new Response(null, { status: 200 }));

    const response = await handle(post('/api/auth/signout', cookie), google.config);

    expect(response.status).toBe(204);
    expect(google.requests).toEqual([]);
  });
});

describe('cross-site POSTs', () => {
  test.each([
    ['/api/auth/refresh', 'another site', 'https://evil.example'],
    ['/api/auth/refresh', 'an opaque origin', 'null'],
    ['/api/auth/refresh', 'no Origin header', null],
    ['/api/auth/signout', 'another site', 'https://evil.example'],
    ['/api/auth/signout', 'a different port of the same host', 'https://app.example:8443'],
    ['/api/auth/signout', 'no Origin header', null],
  ])('%s refuses a request from %s', async (path, _case, requestOrigin) => {
    const google = fakeGoogle(() => Response.json({ access_token: 'a', expires_in: 3599 }));

    const response = await handle(post(path, cookieHeader(await signIn()), requestOrigin), google.config);

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'forbidden' });
    expect(google.requests).toEqual([]);
    expect(setCookies(response)).toEqual([]);
  });
});

describe('missing configuration', () => {
  const routes = [
    ['GET /api/auth/google/start', () => new Request(`${origin}/api/auth/google/start`)],
    ['GET /api/auth/google/callback', () => callbackRequest('state=s&code=c', '')],
    ['POST /api/auth/refresh', () => post('/api/auth/refresh')],
    ['POST /api/auth/signout', () => post('/api/auth/signout')],
  ] as const;

  test.each(routes)('%s fails with a clear 500 naming what is missing', async (_route, request) => {
    const response = await handle(request(), { googleClientId: undefined, googleClientSecret: '', cookieKey: undefined });

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: 'not-configured',
      missing: ['googleClientId', 'googleClientSecret', 'cookieKey'],
    });
  });

  test.each([
    ['too short', btoa('short key')],
    ['not base64', 'not base64!'],
  ])('treats a cookie key that is %s as missing', async (_case, cookieKey) => {
    const response = await handle(new Request(`${origin}/api/auth/google/start`), { ...config, cookieKey });

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'not-configured', missing: ['cookieKey'] });
  });

  test('accepts a cookie key written in base64url', async () => {
    const cookieKey = btoa(String.fromCharCode(...new Uint8Array(32).fill(251))).replace(/\+/g, '-').replace(/\//g, '_');

    const response = await handle(new Request(`${origin}/api/auth/google/start`), { ...config, cookieKey });

    expect(response.status).toBe(302);
  });
});

describe('caching', () => {
  test.each([
    ['the start redirect', () => new Request(`${origin}/api/auth/google/start`)],
    ['a refresh', async () => post('/api/auth/refresh', cookieHeader(await signIn()))],
    ['a refused POST', () => post('/api/auth/refresh', '', 'https://evil.example')],
  ])('forbids caching %s', async (_case, request) => {
    const google = fakeGoogle(() => Response.json({ access_token: 'a', expires_in: 3599 }));

    const response = await handle(await request(), google.config);

    expect(response.headers.get('cache-control')).toBe('no-store');
  });
});

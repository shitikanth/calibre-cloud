const providers = [
  { id: 'google', name: 'Google', authorizationOrigin: 'https://accounts.google.com' },
  { id: 'dropbox', name: 'Dropbox', authorizationOrigin: 'https://www.dropbox.com' },
];

async function checkStart(origin: string, { id, name, authorizationOrigin }: (typeof providers)[number]): Promise<string[]> {
  const route = `GET /api/auth/${id}/start`;
  const response = await fetch(new URL(`/api/auth/${id}/start?return=%2F`, origin), { redirect: 'manual' });
  const location = response.headers.get('location');
  if (response.status !== 302 || !location) {
    const body = (await response.text()).slice(0, 200);
    const detail = response.headers.get('content-type')?.startsWith('application/json') ? `: ${body}` : '';
    return [`${route}: HTTP ${response.status}, expected a 302 to ${name}${detail}`];
  }
  const problems: string[] = [];
  const target = new URL(location);
  if (target.origin !== authorizationOrigin) problems.push(`${route}: redirects to ${target.origin}, expected ${authorizationOrigin}`);
  const callback = `${origin}/api/auth/${id}/callback`;
  const redirectUri = target.searchParams.get('redirect_uri');
  if (redirectUri !== callback) problems.push(`${route}: redirect_uri is ${redirectUri}, expected ${callback}`);
  if (!response.headers.getSetCookie().some((cookie) => cookie.startsWith('signin_state=')))
    problems.push(`${route}: sets no signin_state cookie`);
  return problems;
}

async function checkRefreshWithoutSignIn(origin: string): Promise<string[]> {
  const response = await fetch(new URL('/api/auth/refresh', origin), { method: 'POST', headers: { origin } });
  const body = await response.text();
  if (response.status === 401 && body === '{"error":"reconnect"}') return [];
  return [`POST /api/auth/refresh: HTTP ${response.status} ${body.slice(0, 200)}, expected 401 {"error":"reconnect"}`];
}

export async function checkAuthRoutes(origin: string): Promise<string[]> {
  const starts = await Promise.all(providers.map((provider) => checkStart(origin, provider)));
  return [...starts.flat(), ...(await checkRefreshWithoutSignIn(origin))];
}

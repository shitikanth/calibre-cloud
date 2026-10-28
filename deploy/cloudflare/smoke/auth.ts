const google = 'https://accounts.google.com';

async function checkStart(origin: string): Promise<string[]> {
  const route = 'GET /api/auth/google/start';
  const response = await fetch(new URL('/api/auth/google/start?return=%2F', origin), { redirect: 'manual' });
  const location = response.headers.get('location');
  if (response.status !== 302 || !location) {
    const body = (await response.text()).slice(0, 200);
    const detail = response.headers.get('content-type')?.startsWith('application/json') ? `: ${body}` : '';
    return [`${route}: HTTP ${response.status}, expected a 302 to Google${detail}`];
  }
  const problems: string[] = [];
  const target = new URL(location);
  if (target.origin !== google) problems.push(`${route}: redirects to ${target.origin}, expected ${google}`);
  const callback = `${origin}/api/auth/google/callback`;
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
  return [...(await checkStart(origin)), ...(await checkRefreshWithoutSignIn(origin))];
}

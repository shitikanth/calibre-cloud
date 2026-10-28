import { handle, type Config } from '@calibre-cloud/api';

interface Env {
  readonly GOOGLE_CLIENT_ID?: string;
  readonly GOOGLE_CLIENT_SECRET?: string;
  readonly AUTH_COOKIE_KEY?: string;
}

function configFrom(env: Env): Config {
  return {
    googleClientId: env.GOOGLE_CLIENT_ID,
    googleClientSecret: env.GOOGLE_CLIENT_SECRET,
    cookieKey: env.AUTH_COOKIE_KEY,
  };
}

export default {
  fetch: (request: Request, env: Env) => handle(request, configFrom(env)),
};

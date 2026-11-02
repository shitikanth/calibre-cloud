import { handle, type Config } from '@calibre-cloud/api';

interface Env {
  readonly GOOGLE_CLIENT_ID?: string;
  readonly GOOGLE_CLIENT_SECRET?: string;
  readonly DROPBOX_APP_KEY?: string;
  readonly DROPBOX_APP_SECRET?: string;
  readonly ONEDRIVE_CLIENT_ID?: string;
  readonly ONEDRIVE_CLIENT_SECRET?: string;
  readonly AUTH_COOKIE_KEY?: string;
}

function configFrom(env: Env): Config {
  return {
    googleClientId: env.GOOGLE_CLIENT_ID,
    googleClientSecret: env.GOOGLE_CLIENT_SECRET,
    dropboxClientId: env.DROPBOX_APP_KEY,
    dropboxClientSecret: env.DROPBOX_APP_SECRET,
    onedriveClientId: env.ONEDRIVE_CLIENT_ID,
    onedriveClientSecret: env.ONEDRIVE_CLIENT_SECRET,
    cookieKey: env.AUTH_COOKIE_KEY,
  };
}

export default {
  fetch: (request: Request, env: Env) => handle(request, configFrom(env)),
};

import { exchangeCode, postForm, refreshAccessToken, type OAuthClient, type SignInProvider } from './oauth.ts';

const authorizationEndpoint = 'https://accounts.google.com/o/oauth2/v2/auth';
const tokenEndpoint = 'https://oauth2.googleapis.com/token';
const revokeEndpoint = 'https://oauth2.googleapis.com/revoke';
const driveReadonly = 'https://www.googleapis.com/auth/drive.readonly';

export function googleProvider(client: OAuthClient): SignInProvider {
  return {
    authorizationUrl(redirectUri, state) {
      const url = new URL(authorizationEndpoint);
      url.search = new URLSearchParams({
        client_id: client.clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: driveReadonly,
        access_type: 'offline',
        prompt: 'consent',
        state,
      }).toString();
      return url.href;
    },
    exchangeCode: (code, redirectUri) => exchangeCode(client, tokenEndpoint, code, redirectUri),
    refresh: (refreshToken) => refreshAccessToken(client, tokenEndpoint, refreshToken),
    async revoke(refreshToken) {
      try {
        await postForm(client, revokeEndpoint, { token: refreshToken });
      } catch {
        return;
      }
    },
  };
}

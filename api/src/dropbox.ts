import { exchangeCode, refreshAccessToken, type OAuthClient, type SignInProvider } from './oauth.ts';

const authorizationEndpoint = 'https://www.dropbox.com/oauth2/authorize';
const tokenEndpoint = 'https://api.dropboxapi.com/oauth2/token';
const readOnlyScopes = 'files.metadata.read files.content.read';

export function dropboxProvider(client: OAuthClient): SignInProvider {
  return {
    authorizationUrl(redirectUri, state) {
      const url = new URL(authorizationEndpoint);
      url.search = new URLSearchParams({
        client_id: client.clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        token_access_type: 'offline',
        scope: readOnlyScopes,
        state,
      }).toString();
      return url.href;
    },
    exchangeCode: (code, redirectUri) => exchangeCode(client, tokenEndpoint, code, redirectUri),
    refresh: (refreshToken) => refreshAccessToken(client, tokenEndpoint, refreshToken),
    async revoke() {},
  };
}

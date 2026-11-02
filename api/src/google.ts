import { codeFlow, postForm, type OAuthClient, type OAuthProvider } from './oauth.ts';

const revokeEndpoint = 'https://oauth2.googleapis.com/revoke';

export function googleProvider(client: OAuthClient): OAuthProvider {
  return {
    ...codeFlow(client, {
      authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenEndpoint: 'https://oauth2.googleapis.com/token',
      authorizationParams: { scope: 'https://www.googleapis.com/auth/drive.readonly', access_type: 'offline', prompt: 'consent' },
    }),
    async revoke(refreshToken) {
      try {
        await postForm(client, revokeEndpoint, { token: refreshToken });
      } catch {
        return;
      }
    },
  };
}

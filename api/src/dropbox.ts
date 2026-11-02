import { codeFlow, type OAuthClient, type OAuthProvider } from './oauth.ts';

const revokeEndpoint = 'https://api.dropboxapi.com/2/auth/token/revoke';

export function dropboxProvider(client: OAuthClient): OAuthProvider {
  const flow = codeFlow(client, {
    authorizationEndpoint: 'https://www.dropbox.com/oauth2/authorize',
    tokenEndpoint: 'https://api.dropboxapi.com/oauth2/token',
    authorizationParams: { token_access_type: 'offline', scope: 'files.metadata.read files.content.read' },
  });
  return {
    ...flow,
    async revoke(refreshToken) {
      const refreshed = await flow.refresh(refreshToken);
      if (refreshed.kind !== 'ok') return;
      try {
        await client.fetch(revokeEndpoint, { method: 'POST', headers: { authorization: `Bearer ${refreshed.accessToken}` } });
      } catch {
        return;
      }
    },
  };
}

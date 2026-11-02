import { codeFlow, type OAuthClient, type OAuthProvider } from './oauth.ts';

export function onedriveProvider(client: OAuthClient): OAuthProvider {
  return {
    ...codeFlow(client, {
      authorizationEndpoint: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
      tokenEndpoint: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
      authorizationParams: { response_mode: 'query', scope: 'Files.Read offline_access' },
    }),
    revoke: () => Promise.resolve(),
  };
}

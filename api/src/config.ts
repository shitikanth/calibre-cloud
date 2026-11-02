export interface Config {
  readonly googleClientId: string | undefined;
  readonly googleClientSecret: string | undefined;
  readonly dropboxClientId: string | undefined;
  readonly dropboxClientSecret: string | undefined;
  readonly cookieKey: string | undefined;
  readonly fetch?: typeof fetch;
}

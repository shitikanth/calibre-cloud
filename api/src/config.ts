export interface Config {
  readonly googleClientId: string | undefined;
  readonly googleClientSecret: string | undefined;
  readonly cookieKey: string | undefined;
  readonly fetch?: typeof fetch;
}

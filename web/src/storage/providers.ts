import { createAccessTokens, type AccessTokenClient } from './access-tokens.ts';
import type { StorageAdapter } from './adapter.ts';
import { googleProvider } from './google/provider.ts';
import { megaProvider } from './mega/provider.ts';
import type { Connection, LinkProvider, ParsedConnectInput, StorageProvider } from './provider.ts';
import type { LibraryFinder, SignInProvider } from './sign-in.ts';

export const providers: readonly StorageProvider[] = [megaProvider, googleProvider];

export type ResolvedConnectInput = { provider: LinkProvider; parsed: ParsedConnectInput };

export type Providers = {
  readonly all: readonly StorageProvider[];
  readonly linkProviders: readonly LinkProvider[];
  readonly signInProviders: readonly SignInProvider[];
  resolveConnectInput(input: string): ResolvedConnectInput;
  readConnection(value: unknown): Connection | undefined;
  connectInputFor(connection: Connection): string | undefined;
  openStorage(connection: Connection): StorageAdapter;
  signInProvider(id: string): SignInProvider | undefined;
  libraryFinder(provider: SignInProvider): LibraryFinder;
  signInHref(provider: SignInProvider, returnTo: string): string;
  reconnectHref(connection: Connection, returnTo: string): string | undefined;
  endSignIn(connection: Connection): Promise<void>;
};

export function createProviders(list: readonly StorageProvider[], tokens: AccessTokenClient): Providers {
  const linkProviders = list.filter((provider): provider is LinkProvider => provider.kind === 'link');
  const signInProviders = list.filter((provider): provider is SignInProvider => provider.kind === 'sign-in');
  const providerFor = (connection: Connection) => list.find(({ id }) => id === connection.provider);
  const signInFor = (connection: Connection) => signInProviders.find(({ id }) => id === connection.provider);
  const signInHref = (provider: SignInProvider, returnTo: string) =>
    `${provider.startPath}?${new URLSearchParams({ return: returnTo })}`;

  return {
    all: list,
    linkProviders,
    signInProviders,
    resolveConnectInput(input) {
      const attempts = linkProviders.map((provider) => ({ provider, parsed: provider.parseConnectInput(input) }));
      return attempts.find(({ parsed }) => parsed.ok) ?? attempts[0]!;
    },
    readConnection(value) {
      return list.some((provider) => provider.isConnection(value)) ? (value as Connection) : undefined;
    },
    connectInputFor(connection) {
      return linkProviders.find(({ id }) => id === connection.provider)?.connectInput?.(connection);
    },
    openStorage(connection) {
      const provider = providerFor(connection);
      if (!provider) throw new Error(`No storage provider called ${connection.provider}`);
      return provider.kind === 'link' ? provider.open(connection) : provider.open(connection, tokens);
    },
    signInProvider: (id) => signInProviders.find((provider) => provider.id === id),
    libraryFinder: (provider) => provider.libraryFinder(tokens),
    signInHref,
    reconnectHref(connection, returnTo) {
      const provider = signInFor(connection);
      return provider && signInHref(provider, returnTo);
    },
    async endSignIn(connection) {
      if (signInFor(connection)) await tokens.signOut();
    },
  };
}

export const storageProviders = createProviders(providers, createAccessTokens());

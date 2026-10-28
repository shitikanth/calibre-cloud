import { createMemoryHistory } from '@tanstack/react-router';
import { render } from 'vitest-browser-react';
import { App } from '../app.tsx';
import { saveConnection, type Connection } from '../connection/connection.ts';
import { renderers as productionRenderers } from '../reader/renderers.ts';
import type { Renderers } from '../reader/renderer.ts';
import { createAppRouter } from '../router.tsx';
import { createAccessTokens } from '../storage/access-tokens.ts';
import type { StorageAdapter } from '../storage/adapter.ts';
import { createProviders, providers as appProviders, type Providers } from '../storage/providers.ts';
import { FakeAuthServer } from './fake-auth.ts';
import type { FakeSignInProvider } from './fake-sign-in.ts';
import '../index.css';

export const testLink = 'https://mega.nz/folder/TestHandle#TestKey_123';

const mounted = new Set<{ unmount(): Promise<void> | void }>();

export async function unmountApps() {
  for (const screen of mounted) await screen.unmount();
  mounted.clear();
}

export type RenderAppOptions = {
  storage: StorageAdapter;
  path?: string;
  connected?: boolean | Connection;
  renderers?: Renderers;
  signIn?: FakeSignInProvider;
  auth?: FakeAuthServer;
};

export async function renderApp({
  storage,
  path = '/',
  connected = false,
  renderers = productionRenderers,
  signIn,
  auth = new FakeAuthServer(),
}: RenderAppOptions) {
  if (connected) saveConnection(connected === true ? { provider: 'mega', link: testLink } : connected);
  const opened: Connection[] = [];
  const pageProviders = (): Providers => {
    const registry = createProviders([...appProviders.filter(({ kind }) => kind === 'link'), ...(signIn ? [signIn] : [])], createAccessTokens({ fetch: auth.fetch }));
    return {
      ...registry,
      openStorage(connection) {
        opened.push(connection);
        return signIn?.isConnection(connection) ? registry.openStorage(connection) : storage;
      },
    };
  };
  let history = createMemoryHistory({ initialEntries: [path] });
  const mount = async () => {
    const mountedScreen = await render(<App router={createAppRouter({ history })} providers={pageProviders()} renderers={renderers} />);
    mounted.add(mountedScreen);
    return mountedScreen;
  };

  let screen = await mount();
  return {
    get screen() {
      return screen;
    },
    opened,
    auth,
    get url() {
      return history.location.href;
    },
    back() {
      history.back();
    },
    navigate(to: string) {
      history.push(to);
    },
    async reload({ whileClosed }: { whileClosed?: () => Promise<void> } = {}) {
      await screen.unmount();
      mounted.delete(screen);
      await whileClosed?.();
      history = createMemoryHistory({ initialEntries: [history.location.href] });
      screen = await mount();
      return screen;
    },
  };
}

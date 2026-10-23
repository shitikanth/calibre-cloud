import { createMemoryHistory } from '@tanstack/react-router';
import { render } from 'vitest-browser-react';
import { App } from '../app.tsx';
import { saveConnection, type Connection } from '../connection/connection.ts';
import { renderers as productionRenderers } from '../reader/renderers.ts';
import type { Renderers } from '../reader/renderer.ts';
import { createAppRouter } from '../router.tsx';
import type { StorageAdapter } from '../storage/adapter.ts';
import '../index.css';

export const testLink = 'https://mega.nz/folder/TestHandle#TestKey_123';

const mounted = new Set<{ unmount(): Promise<void> | void }>();

export async function unmountApps() {
  for (const screen of mounted) await screen.unmount();
  mounted.clear();
}

export type RenderAppOptions = { storage: StorageAdapter; path?: string; connected?: boolean; renderers?: Renderers };

export async function renderApp({ storage, path = '/', connected = false, renderers = productionRenderers }: RenderAppOptions) {
  if (connected) saveConnection({ provider: 'mega', link: testLink });
  const opened: Connection[] = [];
  const openStorage = (connection: Connection) => {
    opened.push(connection);
    return storage;
  };
  let history = createMemoryHistory({ initialEntries: [path] });
  const mount = async () => {
    const mountedScreen = await render(<App router={createAppRouter({ history })} openStorage={openStorage} renderers={renderers} />);
    mounted.add(mountedScreen);
    return mountedScreen;
  };

  let screen = await mount();
  return {
    get screen() {
      return screen;
    },
    opened,
    get url() {
      return history.location.href;
    },
    back() {
      history.back();
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

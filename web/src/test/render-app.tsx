import { createMemoryHistory } from '@tanstack/react-router';
import { render } from 'vitest-browser-react';
import { App } from '../app.tsx';
import { saveConnection, type Connection } from '../connection/connection.ts';
import { createAppRouter } from '../router.tsx';
import type { StorageAdapter } from '../storage/adapter.ts';

export const testLink = 'https://mega.nz/folder/TestHandle#TestKey_123';

export type RenderAppOptions = { storage: StorageAdapter; path?: string; connected?: boolean };

export async function renderApp({ storage, path = '/', connected = false }: RenderAppOptions) {
  if (connected) saveConnection({ provider: 'mega', link: testLink });
  const opened: Connection[] = [];
  const openStorage = (connection: Connection) => {
    opened.push(connection);
    return storage;
  };
  const mount = () =>
    render(
      <App
        router={createAppRouter({ history: createMemoryHistory({ initialEntries: [path] }) })}
        openStorage={openStorage}
      />,
    );

  let screen = await mount();
  return {
    get screen() {
      return screen;
    },
    opened,
    async reload() {
      await screen.unmount();
      screen = await mount();
      return screen;
    },
  };
}

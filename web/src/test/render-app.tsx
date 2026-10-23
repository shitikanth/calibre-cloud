import { createMemoryHistory } from '@tanstack/react-router';
import { render } from 'vitest-browser-react';
import { App } from '../app.tsx';
import type { Connection } from '../connection/connection.ts';
import { createAppRouter } from '../router.tsx';
import type { StorageAdapter } from '../storage/adapter.ts';

export type RenderAppOptions = { storage: StorageAdapter; path?: string };

export async function renderApp({ storage, path = '/' }: RenderAppOptions) {
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

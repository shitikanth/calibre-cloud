import { createMemoryHistory } from '@tanstack/react-router';
import { expect, test } from 'vitest';
import { render } from 'vitest-browser-react';
import { App } from './app.tsx';
import { createAppRouter } from './router.tsx';

test('renders the app shell at the root URL', async () => {
  const router = createAppRouter({ history: createMemoryHistory({ initialEntries: ['/'] }) });

  const screen = await render(<App router={router} />);

  await expect.element(screen.getByRole('heading', { level: 1, name: 'calibre-cloud' })).toBeVisible();
});

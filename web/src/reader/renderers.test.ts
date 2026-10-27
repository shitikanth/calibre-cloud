import { expect, test } from 'vitest';
import { renderers } from './renderers.ts';

test.each(['EPUB', 'KEPUB', 'MOBI', 'AZW', 'AZW3', 'KF8', 'PRC', 'FB2', 'FBZ', 'CBZ', 'PDF'])('%s resolves to a renderer', async (format) => {
  const factory = renderers[format];
  expect(factory).toBeDefined();

  const renderer = await factory!();

  try {
    expect(renderer).toMatchObject({ open: expect.any(Function), goTo: expect.any(Function), destroy: expect.any(Function) });
  } finally {
    renderer.destroy();
  }
});

test.each(['TXT', 'DOCX', 'epub', 'ORIGINAL_EPUB'])('%s has no renderer', (format) => {
  expect(renderers[format]).toBeUndefined();
});

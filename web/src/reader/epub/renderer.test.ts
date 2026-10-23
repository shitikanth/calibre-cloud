import { afterEach, expect, test, vi } from 'vitest';
import type { Relocation } from '../renderer.ts';
import { createEpubRenderer, type EpubRenderer } from './renderer.ts';
import fixtureUrl from '../../test/fixtures/two-chapters.epub?url';

let container: HTMLElement | undefined;
let renderer: EpubRenderer | undefined;

afterEach(async () => {
  await nextFrame();
  renderer?.destroy();
  renderer = undefined;
  container?.remove();
  container = undefined;
});

function nextFrame() {
  return new Promise(requestAnimationFrame);
}

async function openFixture(location?: string) {
  container = document.createElement('div');
  container.style.cssText = 'width: 600px; height: 800px';
  document.body.append(container);
  const blob = await (await fetch(fixtureUrl)).blob();
  renderer = await createEpubRenderer();
  const relocations: Relocation[] = [];
  renderer.onRelocate((relocation) => relocations.push(relocation));
  await renderer.open(blob, container, location === undefined ? {} : { location });
  await vi.waitFor(() => expect(relocations.length).toBeGreaterThan(0));
  await nextFrame();
  return { renderer, relocations, container };
}

test('opens the fixture and reports the start of the visible range with a fraction', async () => {
  const { relocations } = await openFixture();

  expect(relocations[0]?.location).toMatch(/^epubcfi\(.+\)$/);
  expect(relocations[0]?.location).not.toContain(',');
  expect(relocations[0]?.fraction).toBeGreaterThanOrEqual(0);
  expect(relocations[0]?.fraction).toBeLessThanOrEqual(1);
});

test('exposes the TOC, and goTo on a TOC entry lands in chapter two', async () => {
  const { renderer, relocations } = await openFixture();

  expect(renderer.toc).toEqual([
    { label: 'One: The Lighthouse Ledger', location: 'OEBPS/text/chapter-one.xhtml' },
    { label: 'Two: The Unsent Letters', location: 'OEBPS/text/chapter-two.xhtml' },
  ]);
  const opening = relocations[0]?.fraction ?? Number.NaN;

  await renderer.goTo(renderer.toc[1]?.location ?? '');

  expect(renderer.sectionDocument?.getElementById('chapter-two')?.textContent).toBe('Two: The Unsent Letters');
  expect(relocations.at(-1)?.fraction).toBeGreaterThan(opening);
});

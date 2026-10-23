import { expect, test } from 'vitest';
import { userEvent } from 'vitest/browser';
import { buildCalibreLibrary } from './test/calibre-library.ts';
import { FakeStorage } from './test/fake-storage.ts';
import { renderApp } from './test/render-app.tsx';

type Screen = Awaited<ReturnType<typeof renderApp>>['screen'];

async function twoBookLibrary() {
  return new FakeStorage(
    await buildCalibreLibrary([
      { title: 'Jane Eyre', authors: ['Charlotte Brontë'], hasCover: true },
      { title: 'Wuthering Heights', authors: ['Emily Brontë'] },
    ]),
  );
}

function tile(screen: Screen, title: string) {
  return screen.getByRole('link', { name: new RegExp(title) });
}

function styleOf(element: Element) {
  const { translate, boxShadow, outlineStyle, outlineWidth } = getComputedStyle(element);
  return { translate, boxShadow, outlineStyle, outlineWidth };
}

test('hovering a tile lifts it, and leaving it puts it back', async () => {
  const app = await renderApp({ storage: await twoBookLibrary(), connected: true });
  const janeEyre = tile(app.screen, 'Jane Eyre');
  await expect.element(janeEyre).toBeVisible();
  const resting = styleOf(janeEyre.element());
  expect(resting.translate).toBe('none');

  await userEvent.hover(janeEyre);

  await expect.poll(() => styleOf(janeEyre.element()).translate).not.toBe('none');

  await userEvent.unhover(janeEyre);

  await expect.poll(() => styleOf(janeEyre.element())).toEqual(resting);
});

test('tabbing to a tile shows a focus ring that the grid does not clip', async () => {
  const app = await renderApp({ storage: await twoBookLibrary(), connected: true });
  const janeEyre = tile(app.screen, 'Jane Eyre');
  await expect.element(janeEyre).toBeVisible();
  expect(styleOf(janeEyre.element()).outlineStyle).toBe('none');

  for (let presses = 0; presses < 10 && document.activeElement !== janeEyre.element(); presses += 1) {
    await userEvent.tab();
  }

  expect(document.activeElement).toBe(janeEyre.element());
  const focused = styleOf(janeEyre.element());
  expect(focused.outlineStyle).toBe('solid');
  expect(parseFloat(focused.outlineWidth)).toBeGreaterThanOrEqual(2);
  const grid = app.screen.getByRole('list', { name: 'Books' }).element();
  const item = janeEyre.element().closest('li')!;
  expect(getComputedStyle(grid).overflow).toBe('visible');
  expect(getComputedStyle(item).overflow).toBe('visible');
});

function flattenRules(rules: CSSRuleList): CSSRule[] {
  return [...rules].flatMap((rule) => [
    rule,
    ...('cssRules' in rule ? flattenRules((rule as CSSGroupingRule).cssRules) : []),
  ]);
}

function enclosingMediaQueries(rule: CSSRule): string[] {
  const queries: string[] = [];
  for (let parent = rule.parentRule; parent; parent = parent.parentRule) {
    if (parent instanceof CSSMediaRule) queries.push(parent.conditionText);
  }
  return queries;
}

test('the hover style only applies on devices that can hover, so a tap leaves nothing behind', async () => {
  const app = await renderApp({ storage: await twoBookLibrary(), connected: true });
  const janeEyre = tile(app.screen, 'Jane Eyre');
  await expect.element(janeEyre).toBeVisible();

  const hoverRules = [...document.styleSheets]
    .flatMap((sheet) => flattenRules(sheet.cssRules))
    .filter((rule): rule is CSSStyleRule => rule instanceof CSSStyleRule && rule.selectorText.includes(':hover'))
    .filter((rule) => janeEyre.element().matches(rule.selectorText.replaceAll(':hover', '')));

  expect(hoverRules.length).toBeGreaterThan(0);
  for (const rule of hoverRules) expect(enclosingMediaQueries(rule)).toContain('(hover: hover)');
});

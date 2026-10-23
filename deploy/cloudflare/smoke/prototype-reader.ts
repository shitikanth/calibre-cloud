// PROTOTYPE driver: opens fixtures in the reader prototype under wrangler's CSP and prints what happened.
// usage: node deploy/cloudflare/smoke/prototype-reader.ts <chromium|webkit> <origin> <fixtures-dir> <out-dir>
import { chromium, webkit, type Page } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

declare global {
  interface Window {
    __proto: { entries: { t: number; kind: string; text: string }[]; state: Record<string, unknown> };
  }
}

const [browserName = 'chromium', origin = 'http://127.0.0.1:8799', fixtures = '.', out = '.'] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const browser = await (browserName === 'webkit' ? webkit : chromium).launch();
const report: Record<string, unknown> = { browser: browserName };

function rendererRssMB() {
  const needle = browserName === 'webkit' ? 'WebKit.WebContent' : '--type=renderer';
  const rows = execSync('ps -axo rss=,command=', { encoding: 'utf8' }).split('\n').filter((l) => l.includes(needle) && l.includes('ms-playwright'));
  const rss = rows.map((l) => Number(l.trim().split(/\s+/)[0]) / 1024);
  return { maxRendererRssMB: Math.round(Math.max(0, ...rss)), rendererCount: rss.length };
}

async function heap(page: Page) {
  const rss = rendererRssMB();
  if (browserName !== 'chromium') return rss;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  await cdp.send('HeapProfiler.collectGarbage').catch(() => {});
  const { metrics } = await cdp.send('Performance.getMetrics');
  const m = Object.fromEntries(metrics.map((x) => [x.name, x.value]));
  await cdp.detach();
  return { ...rss, jsHeapUsedMB: Math.round(m['JSHeapUsedSize']! / 1048576), jsHeapTotalMB: Math.round(m['JSHeapTotalSize']! / 1048576) };
}

async function run(name: string, file: string, drive: (page: Page) => Promise<Record<string, unknown>>) {
  const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
  const console_: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console_.push(`${m.type()}: ${m.text()}`); });
  page.on('pageerror', (e) => console_.push(`pageerror: ${e.message}`));
  const result: Record<string, unknown> = {};
  try {
    await page.goto(`${origin}/prototype/reader`, { waitUntil: 'networkidle' });
    result['rssBeforeOpen'] = rendererRssMB();
    const t0 = Date.now();
    await page.getByTestId('file').setInputFiles(join(fixtures, file));
    await page.waitForFunction(() => window.__proto.state['opened'] || window.__proto.entries.some((e) => e.kind === 'error'), undefined, { timeout: 120_000 });
    result['wallMsToOpen'] = Date.now() - t0;
    Object.assign(result, await drive(page));
    result['heap'] = await heap(page);
    await page.screenshot({ path: join(out, `${browserName}-${name}.png`) });
  } catch (e) {
    result['driverError'] = String(e);
  }
  result['state'] = await page.evaluate(() => window.__proto.state).catch(() => undefined);
  result['entries'] = await page.evaluate(() => window.__proto.entries.map((e) => `${e.t}\t${e.kind}\t${e.text}`)).catch(() => undefined);
  result['console'] = console_;
  report[name] = result;
  console.log(`\n=== ${browserName} / ${name}`);
  console.log(JSON.stringify(result, null, 2));
  await page.close();
}

const settle = (page: Page, ms = 800) => page.waitForTimeout(ms);
const cfi = (page: Page) => page.evaluate(() => String(window.__proto.state['cfi'] ?? ''));

await run('moby-dick-epub', 'moby-dick.epub', async (page) => {
  const r: Record<string, unknown> = {};
  await page.waitForFunction(() => window.__proto.state['cfi'], undefined, { timeout: 30_000 });
  await settle(page);
  r['cfiStart'] = await cfi(page);
  for (let i = 0; i < 3; i++) { await page.getByRole('button', { name: 'Next', exact: true }).click(); await settle(page, 400); }
  const paged = await cfi(page);
  r['cfiAfter3Next'] = paged;
  await page.getByTestId('flow').click(); await settle(page, 1500);
  r['cfiAfterScrolledSwitch'] = await cfi(page);
  r['scrolledKeptPlace'] = r['cfiAfterScrolledSwitch'] === paged;
  await page.getByRole('button', { name: 'Next', exact: true }).click(); await settle(page, 600);
  r['cfiScrolledNext'] = await cfi(page);
  await page.getByTestId('flow').click(); await settle(page, 1500);
  await page.getByTestId('cfi').fill(paged);
  await page.getByRole('button', { name: 'Go', exact: true }).click(); await settle(page, 1500);
  r['cfiAfterGoTo'] = await cfi(page);
  r['goToRoundTrip'] = r['cfiAfterGoTo'] === paged;
  await page.getByRole('button', { name: 'A+' }).click(); await settle(page, 800);
  r['cfiAfterFontUp'] = await cfi(page);
  const toc = page.locator('ul li button');
  r['tocEntries'] = await toc.count();
  await toc.nth(Math.min(5, (await toc.count()) - 1)).click(); await settle(page, 1200);
  r['cfiAfterToc'] = await cfi(page);
  r['iframeSandbox'] = await page.evaluate(() => [...document.querySelectorAll('foliate-view')].map((v) => v.shadowRoot?.querySelector('foliate-paginator')?.shadowRoot?.querySelector('iframe')?.getAttribute('sandbox')));
  r['iframeSrcScheme'] = await page.evaluate(() => document.querySelector('foliate-view')?.shadowRoot?.querySelector('foliate-paginator')?.shadowRoot?.querySelector('iframe')?.src.split(':')[0]);
  return r;
});

await run('epub-test-scripts', 'epub-test.epub', async (page) => {
  await page.waitForFunction(() => window.__proto.state['sectionLoaded'] !== undefined, undefined, { timeout: 30_000 });
  await settle(page, 2000);
  return {};
});

for (const [name, file] of [['arxiv-pdf-6.8MB', 'arxiv.pdf'], ['large-pdf-91MB', 'large.pdf']] as const) {
  await run(name, file, async (page) => {
    const r: Record<string, unknown> = {};
    await page.waitForFunction(() => window.__proto.state['rendered'], undefined, { timeout: 120_000 });
    r['heapAfterFirstPage'] = await heap(page);
    for (let i = 0; i < 5; i++) { await page.getByTestId('pdf-next').click(); await page.waitForFunction((n) => Number(window.__proto.state['rendered']) >= n, i + 2, { timeout: 60_000 }); }
    await page.getByTestId('pdf-zoom-in').click(); await page.waitForFunction(() => Number(window.__proto.state['rendered']) >= 7, undefined, { timeout: 60_000 });
    return r;
  });
}

writeFileSync(join(out, `${browserName}-report.json`), JSON.stringify(report, null, 2));
await browser.close();

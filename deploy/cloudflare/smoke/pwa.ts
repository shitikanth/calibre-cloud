import { chromium, type BrowserContext, type Page } from 'playwright';

const serviceWorkerCacheControl = 'no-cache';
const outsideTheShell = /^\/(api\/|(about|privacy|terms)(\.html)?$)/;

async function serviceWorkerScriptProblems(origin: string): Promise<string[]> {
  const response = await fetch(new URL('/sw.js', origin));
  await response.body?.cancel();
  if (!response.ok) return [`/sw.js: HTTP ${response.status}`];
  const cacheControl = response.headers.get('cache-control') ?? '(none)';
  return cacheControl === serviceWorkerCacheControl ? [] : [`/sw.js: cache-control ${cacheControl}, expected ${serviceWorkerCacheControl}`];
}

interface ManifestIcon {
  readonly src?: string;
  readonly sizes?: string;
  readonly type?: string;
}

interface Manifest {
  readonly name?: string;
  readonly short_name?: string;
  readonly start_url?: string;
  readonly display?: string;
  readonly icons?: readonly ManifestIcon[];
}

async function pngProblem(label: string, url: string): Promise<string | undefined> {
  const response = await fetch(url);
  await response.body?.cancel();
  const type = response.headers.get('content-type') ?? '(none)';
  return response.ok && type === 'image/png' ? undefined : `${label}: HTTP ${response.status} ${type}, expected 200 image/png`;
}

async function installabilityProblems(page: Page): Promise<string[]> {
  const cdp = await page.context().newCDPSession(page);
  const { url, errors, data } = await cdp.send('Page.getAppManifest');
  await cdp.detach();
  if (!url) return ['manifest: none linked from /'];
  const problems = errors.map((error) => `manifest: ${error.message}`);
  const manifest = JSON.parse(data ?? '{}') as Manifest;
  if (!manifest.name && !manifest.short_name) problems.push('manifest: no name or short_name');
  if (!manifest.start_url) problems.push('manifest: no start_url');
  if (!['standalone', 'fullscreen', 'minimal-ui'].includes(manifest.display ?? '')) problems.push(`manifest: display ${manifest.display ?? '(none)'}, expected standalone`);
  for (const size of ['192x192', '512x512']) {
    const icon = manifest.icons?.find((candidate) => candidate.type === 'image/png' && candidate.sizes?.split(' ').includes(size));
    const problem = icon?.src ? await pngProblem(`manifest icon ${size}`, new URL(icon.src, url).href) : `manifest: no ${size} PNG icon`;
    if (problem) problems.push(problem);
  }
  return problems;
}

async function touchIconProblems(page: Page): Promise<string[]> {
  const href = await page.evaluate(() => document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]')?.href);
  if (!href) return ['no apple-touch-icon link'];
  const problem = await pngProblem('apple-touch-icon', href);
  return problem ? [problem] : [];
}

async function takesControl(page: Page): Promise<boolean> {
  const ready = await page.evaluate(() =>
    Promise.race([navigator.serviceWorker.ready.then(() => true), new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 5_000))]),
  );
  if (!ready) return false;
  await page.reload({ waitUntil: 'networkidle' });
  return page.evaluate(() => navigator.serviceWorker.controller !== null);
}

async function cachedOutsideTheShell(page: Page, origin: string): Promise<string[]> {
  const entries = await page.evaluate(async () => {
    const found: [string, string][] = [];
    for (const name of await caches.keys()) {
      for (const request of await (await caches.open(name)).keys()) found.push([name, request.url]);
    }
    return found;
  });
  return entries
    .filter(([, url]) => new URL(url).origin !== origin || outsideTheShell.test(new URL(url).pathname))
    .map(([name, url]) => `service worker cache ${name} holds ${url}`);
}

async function offlineProblems(context: BrowserContext, origin: string, path: string): Promise<string[]> {
  const page = await context.newPage();
  const problems: string[] = [];
  page.on('pageerror', (error) => problems.push(`${path} offline: uncaught ${error.name}: ${error.message}`));
  try {
    await page.goto(new URL(path, origin).href, { waitUntil: 'load' });
    const rendered = await page.evaluate(() => document.getElementById('root')?.hasChildNodes());
    if (!rendered) problems.push(`${path} offline: #root is empty`);
  } catch (error) {
    problems.push(`${path} offline: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`);
  } finally {
    await page.close();
  }
  return problems;
}

export async function checkInstallableOffline(origin: string, offlinePaths: readonly string[]): Promise<string[]> {
  const problems = await serviceWorkerScriptProblems(origin);
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(new URL('/', origin).href, { waitUntil: 'networkidle' });
    problems.push(...(await installabilityProblems(page)), ...(await touchIconProblems(page)));
    if (await takesControl(page)) problems.push(...(await cachedOutsideTheShell(page, origin)));
    else problems.push('no service worker took control of /');
    await page.close();
    await context.setOffline(true);
    for (const path of offlinePaths) problems.push(...(await offlineProblems(context, origin, path)));
  } finally {
    await browser.close();
  }
  return problems;
}

import { chromium } from 'playwright';
import { cspProblems } from './csp.ts';

export interface PublicPage {
  readonly path: string;
  readonly links?: readonly string[];
}

export const publicPages: readonly PublicPage[] = [
  { path: '/about', links: ['/privacy', '/terms'] },
  { path: '/privacy' },
  { path: '/terms' },
];

export async function checkPublicPages(origin: string, pages = publicPages): Promise<string[]> {
  const browser = await chromium.launch();
  const problems: string[] = [];
  try {
    const context = await browser.newContext({ javaScriptEnabled: false });
    for (const { path, links = [] } of pages) {
      const page = await context.newPage();
      const report = (problem: string) => problems.push(`${path}: ${problem}`);
      page.on('console', (message) => {
        if (message.type() === 'error') report(message.text());
      });

      const response = await page.goto(new URL(path, origin).href, { waitUntil: 'networkidle' });
      if (!response?.ok()) {
        report(`HTTP ${response?.status() ?? 'no response'}`);
        await page.close();
        continue;
      }
      const csp = await response.headerValue('content-security-policy');
      if (!csp) report('no Content-Security-Policy header');
      else for (const problem of cspProblems(csp)) report(`CSP ${problem}`);
      if ((await page.locator('#root').count()) > 0) report('serves the app, not the page');
      else if ((await page.locator('h1').count()) === 0) report('shows no heading without JavaScript');
      for (const link of links) {
        if ((await page.locator(`a[href="${link}"]`).count()) === 0) report(`no link to ${link}`);
      }
      await page.close();
    }
  } finally {
    await browser.close();
  }
  return problems;
}

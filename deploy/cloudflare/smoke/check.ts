import { chromium } from 'playwright';
import { cspProblems } from './csp.ts';

export async function smokeCheck(origin: string, paths: string[]): Promise<string[]> {
  const browser = await chromium.launch();
  const problems: string[] = [];
  try {
    for (const path of paths) {
      const page = await browser.newPage();
      const report = (problem: string) => problems.push(`${path}: ${problem}`);
      page.on('console', (message) => {
        if (message.type() === 'error') report(message.text());
      });
      page.on('pageerror', (error) => report(`uncaught ${error.name}: ${error.message}`));

      const response = await page.goto(new URL(path, origin).href, { waitUntil: 'networkidle' });
      if (!response?.ok()) report(`HTTP ${response?.status() ?? 'no response'}`);
      const csp = await response?.headerValue('content-security-policy');
      if (response && !csp) report('no Content-Security-Policy header');
      if (csp) for (const problem of cspProblems(csp)) report(`CSP ${problem}`);
      const rendered = await page.evaluate(() => document.getElementById('root')?.hasChildNodes());
      if (!rendered) report('#root is empty');
      await page.close();
    }
  } finally {
    await browser.close();
  }
  return problems;
}

import { chromium } from 'playwright';

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
      if (response && !(await response.headerValue('content-security-policy'))) {
        report('no Content-Security-Policy header');
      }
      const rendered = await page.evaluate(() => document.getElementById('root')?.hasChildNodes());
      if (!rendered) report('#root is empty');
      await page.close();
    }
  } finally {
    await browser.close();
  }
  return problems;
}

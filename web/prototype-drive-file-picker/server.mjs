// PROTOTYPE for #156. Throwaway: lives on prototype/drive-file-picker, never merged to main.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const here = fileURLToPath(new URL('.', import.meta.url));
const headersFile = join(here, '../../deploy/cloudflare/_headers');
const port = 8156;

for (const name of ['PICKER_CLIENT_ID', 'PICKER_API_KEY', 'PICKER_APP_ID']) {
  if (!process.env[name]) console.warn(`missing ${name}; see README.md`);
}
const config = {
  clientId: process.env.PICKER_CLIENT_ID ?? '',
  apiKey: process.env.PICKER_API_KEY ?? '',
  appId: process.env.PICKER_APP_ID ?? '',
};

async function productionHeaders() {
  const text = await readFile(headersFile, 'utf8');
  const headers = {};
  for (const line of text.split('\n').slice(1)) {
    if (!line.startsWith('  ')) break;
    const [name, ...rest] = line.trim().split(':');
    headers[name] = rest.join(':').trim();
  }
  return headers;
}

function withAdditions(csp, additions) {
  const directives = new Map(csp.split(';').map((d) => d.trim()).filter(Boolean).map((d) => {
    const [name, ...sources] = d.split(/\s+/);
    return [name, sources];
  }));
  for (const [name, sources] of Object.entries(additions)) {
    directives.set(name, [...(directives.get(name) ?? []), ...sources]);
  }
  return [...directives].map(([name, sources]) => [name, ...sources].join(' ')).join('; ');
}

const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json' };

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  if (url.pathname === '/csp-report') {
    let body = '';
    for await (const chunk of req) body += chunk;
    console.log('[csp-report]', body);
    res.writeHead(204).end();
    return;
  }

  const file = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
  const ext = file.slice(file.lastIndexOf('.'));
  if (!['index.html', 'app.js', 'config.json'].includes(file)) {
    res.writeHead(404).end();
    return;
  }

  const prod = await productionHeaders();
  const mode = url.searchParams.get('csp') === 'prod' ? 'prod' : 'prod+additions';
  const additions = JSON.parse(await readFile(join(here, 'csp-additions.json'), 'utf8'));
  const csp = mode === 'prod' ? prod['Content-Security-Policy'] : withAdditions(prod['Content-Security-Policy'], additions);
  const referrerPolicy = url.searchParams.get('referrer') ?? prod['Referrer-Policy'];

  const body = file === 'config.json'
    ? JSON.stringify({ ...config, csp, cspMode: mode, additions, referrerPolicy })
    : await readFile(join(here, file));

  res.writeHead(200, {
    'content-type': types[ext],
    'cache-control': 'no-store',
    'content-security-policy': `${csp}; report-uri /csp-report`,
    'x-content-type-options': prod['X-Content-Type-Options'],
    'referrer-policy': referrerPolicy,
  });
  res.end(body);
}).listen(port, () => {
  console.log(`PROTOTYPE #156 on http://localhost:${port}`);
});

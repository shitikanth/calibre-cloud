export const expectedCsp: Record<string, string[]> = {
  'default-src': ["'self'"],
  'script-src': ["'self'", "'wasm-unsafe-eval'"],
  'style-src': ["'self'", "'unsafe-inline'", 'blob:'],
  'img-src': ["'self'", 'blob:', 'data:'],
  'font-src': ["'self'", 'blob:', 'data:'],
  'media-src': ["'self'", 'blob:'],
  'frame-src': ['blob:'],
  'connect-src': ["'self'", 'https://g.api.mega.co.nz', 'https://*.userstorage.mega.co.nz', 'https://www.googleapis.com'],
  'worker-src': ["'self'"],
  'object-src': ["'none'"],
  'base-uri': ["'none'"],
  'form-action': ["'none'"],
  'frame-ancestors': ["'self'"],
};

function parseCsp(header: string): Map<string, string[]> {
  const directives = new Map<string, string[]>();
  for (const clause of header.split(';')) {
    const [name, ...sources] = clause.trim().split(/\s+/).filter(Boolean);
    if (name && !directives.has(name.toLowerCase())) directives.set(name.toLowerCase(), sources);
  }
  return directives;
}

function sameSources(a: string[], b: string[]): boolean {
  return a.length === b.length && new Set(a).size === a.length && b.every((source) => a.includes(source));
}

export function cspProblems(header: string): string[] {
  const actual = parseCsp(header);
  const problems: string[] = [];
  for (const [directive, expected] of Object.entries(expectedCsp)) {
    const sources = actual.get(directive);
    if (!sources) problems.push(`${directive} is missing`);
    else if (!sameSources(sources, expected)) problems.push(`${directive} is ${sources.join(' ')}, expected ${expected.join(' ')}`);
  }
  for (const directive of actual.keys()) {
    if (!(directive in expectedCsp)) problems.push(`${directive} is not expected`);
  }
  return problems;
}

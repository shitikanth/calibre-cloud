import type { Database } from './sqlite.ts';

export function fold(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

export function registerFold(db: Database): void {
  db.createFunction({
    name: 'fold',
    xFunc: (_context, value) => (typeof value === 'string' ? fold(value) : (value ?? null)),
    arity: 1,
    deterministic: true,
    innocuous: true,
  });
}

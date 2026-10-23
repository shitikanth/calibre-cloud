// PROTOTYPE: event log shared by the reader prototype, exposed on window for Playwright.
export type Entry = { t: number; kind: string; text: string };

const entries: Entry[] = [];
const listeners = new Set<() => void>();

export function log(kind: string, text: string) {
  entries.push({ t: Math.round(performance.now()), kind, text });
  for (const l of listeners) l();
}

export function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function getEntries() {
  return entries;
}

export function watchViolations(target: EventTarget, where: string) {
  target.addEventListener('securitypolicyviolation', (e) => {
    const v = e as SecurityPolicyViolationEvent;
    log('csp', `${where}: ${v.violatedDirective} blocked ${v.blockedURI || '(inline)'}${v.sourceFile ? ` from ${v.sourceFile}:${v.lineNumber}` : ''}`);
  });
}

declare global {
  interface Window {
    __proto: { entries: Entry[]; state: Record<string, unknown> };
  }
}

window.__proto = { entries, state: {} };
watchViolations(document, 'top');
window.addEventListener('error', (e) => log('error', `top: ${e.message}`));
window.addEventListener('unhandledrejection', (e) => log('error', `top unhandled: ${String(e.reason)}`));

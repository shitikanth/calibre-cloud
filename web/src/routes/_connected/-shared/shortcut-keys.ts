export function withBrowserModifier(event: KeyboardEvent): boolean {
  return event.ctrlKey || event.metaKey || event.altKey;
}

export function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

export function isControl(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest('a[href], button, input, select, textarea, summary, [role="button"], [role="menuitem"]') !== null;
}

export function dialogOpen(): boolean {
  return document.querySelector('dialog[open]') !== null;
}

export function takesShortcut(event: KeyboardEvent): boolean {
  return !withBrowserModifier(event) && !isTyping(event.target) && !dialogOpen();
}

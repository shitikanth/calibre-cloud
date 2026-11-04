import { isControl, isTyping, withBrowserModifier } from '../-shared/shortcut-keys.ts';

export type ReaderTool = 'toc' | 'search' | 'settings';

export type ReaderKeyAction =
  | 'hideControls'
  | 'nextPage'
  | 'previousPage'
  | 'toggleContents'
  | 'openSearch'
  | 'focusSearch'
  | 'nextChapter'
  | 'previousChapter'
  | 'nextMatch'
  | 'previousMatch'
  | 'goBack';

const arrowKeys: Partial<Record<string, ReaderKeyAction>> = { ArrowRight: 'nextPage', ArrowLeft: 'previousPage' };

const plainKeys: Partial<Record<string, ReaderKeyAction>> = {
  PageDown: 'nextPage',
  PageUp: 'previousPage',
  t: 'toggleContents',
  '/': 'openSearch',
  ']': 'nextChapter',
  '[': 'previousChapter',
  n: 'nextMatch',
  N: 'previousMatch',
  Backspace: 'goBack',
};

function withToolOpen(event: KeyboardEvent, tool: ReaderTool): ReaderKeyAction | undefined {
  if (withBrowserModifier(event) || isTyping(event.target)) return undefined;
  if (event.key === 't' && tool === 'toc') return 'toggleContents';
  if (event.key === '/' && tool === 'search') return 'focusSearch';
  return undefined;
}

function space(event: KeyboardEvent): ReaderKeyAction | undefined {
  if (isControl(event.target)) return undefined;
  return event.shiftKey ? 'previousPage' : 'nextPage';
}

export function readerKeyAction(event: KeyboardEvent, tool: ReaderTool | undefined): ReaderKeyAction | undefined {
  if (tool) return withToolOpen(event, tool);
  if (event.key === 'Escape') return 'hideControls';
  if (event.target instanceof HTMLInputElement) return undefined;
  const arrow = arrowKeys[event.key];
  if (arrow) return arrow;
  if (withBrowserModifier(event)) return undefined;
  if (event.key === ' ') return space(event);
  return plainKeys[event.key];
}

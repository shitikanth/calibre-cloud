import type { SearchExcerpt } from './renderer.ts';

export type TextMatch = { start: number; end: number };

const CONTEXT = 30;

type Folded = { text: string; origins: number[] };

function fold(text: string): Folded {
  let folded = '';
  const origins: number[] = [];
  let index = 0;
  for (const char of text) {
    const pieces = /\s/.test(char)
      ? folded.endsWith(' ') ? '' : ' '
      : char.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();
    for (let piece = 0; piece < pieces.length; piece++) origins.push(index);
    folded += pieces;
    index += char.length;
  }
  return { text: folded, origins };
}

export function findMatches(text: string, query: string): TextMatch[] {
  const needle = fold(query.trim()).text;
  if (!needle) return [];
  const haystack = fold(text);
  const matches: TextMatch[] = [];
  for (let at = haystack.text.indexOf(needle); at >= 0; at = haystack.text.indexOf(needle, at + needle.length)) {
    const last = haystack.origins[at + needle.length - 1] ?? 0;
    const end = haystack.origins.slice(at + needle.length).find((origin) => origin > last) ?? text.length;
    matches.push({ start: haystack.origins[at] ?? 0, end });
  }
  return matches;
}

function collapse(text: string): string {
  return text.replace(/\s+/g, ' ');
}

export function excerptOf(text: string, { start, end }: TextMatch): SearchExcerpt {
  const before = collapse(text.slice(0, start)).trimStart();
  const after = collapse(text.slice(end)).trimEnd();
  const head = before.slice(-CONTEXT);
  const tail = after.slice(0, CONTEXT);
  return {
    before: head.length < before.length ? `…${head.slice(head.indexOf(' ') + 1)}` : before,
    match: text.slice(start, end),
    after: tail.length < after.length ? `${tail.slice(0, Math.max(tail.lastIndexOf(' '), 1))}…` : after,
  };
}

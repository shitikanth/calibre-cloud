import { expect, test } from 'vitest';
import { excerptOf, findMatches } from './text-search.ts';

function matched(text: string, query: string): string[] {
  return findMatches(text, query).map(({ start, end }) => text.slice(start, end));
}

test('finds every match, ignoring case', () => {
  expect(findMatches('The whale, the WHALE, the Whale.', 'whale')).toEqual([
    { start: 4, end: 9 },
    { start: 15, end: 20 },
    { start: 26, end: 31 },
  ]);
});

test('ignores diacritics on either side, and gives offsets in the original text', () => {
  expect(matched('Un café crème au Café de Flore', 'cafe')).toEqual(['café', 'Café']);
  expect(matched('a cafe on the corner', 'CAFÉ')).toEqual(['cafe']);
  expect(matched('Café society', 'cafe')).toEqual(['Café']);
});

test('matches across ligatures and runs of whitespace', () => {
  expect(matched('the ﬁrst  ﬂoor', 'first floor')).toEqual(['ﬁrst  ﬂoor']);
  expect(matched('end of line\nnext line', 'line next')).toEqual(['line\nnext']);
});

test('a blank query matches nothing', () => {
  expect(findMatches('anything', '  ')).toEqual([]);
  expect(findMatches('', 'word')).toEqual([]);
});

test('an excerpt splits the text around the match and trims long context with an ellipsis', () => {
  const text = 'Call me Ishmael. Some years ago, never mind how long precisely, having little or no money in my purse.';
  const [match] = findMatches(text, 'never mind');
  expect(match && excerptOf(text, match)).toEqual({
    before: '…me Ishmael. Some years ago, ',
    match: 'never mind',
    after: ' how long precisely, having…',
  });
  const [short] = findMatches('a  small\nworld', 'small');
  expect(short && excerptOf('a  small\nworld', short)).toEqual({ before: 'a ', match: 'small', after: ' world' });
});

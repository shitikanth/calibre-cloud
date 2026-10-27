import { expect, test } from 'vitest';
import { entryStartingAt } from './toc.ts';

const toc = [
  { label: 'Front', location: '1' },
  {
    label: 'Part one',
    location: '3',
    children: [
      { label: 'Chapter one', location: '3' },
      { label: 'Chapter two', location: '7' },
    ],
  },
  { label: 'Part two', location: '12' },
];

test('the current entry is the one starting nearest before the position, a child winning a tie with its parent', () => {
  expect(entryStartingAt(toc, 2)?.label).toBe('Front');
  expect(entryStartingAt(toc, 3)?.label).toBe('Chapter one');
  expect(entryStartingAt(toc, 9)?.label).toBe('Chapter two');
  expect(entryStartingAt(toc, 12)?.label).toBe('Part two');
});

test('nothing is current before the first entry or in an empty list', () => {
  expect(entryStartingAt(toc.slice(1), 2)).toBeUndefined();
  expect(entryStartingAt([], 5)).toBeUndefined();
});

test('an out-of-order outline still picks the nearest preceding start', () => {
  const merged = [
    { label: 'Chapter one', location: '10' },
    { label: 'Chapter two', location: '20' },
    { label: 'Appendix', location: '5' },
  ];

  expect(entryStartingAt(merged, 25)?.label).toBe('Chapter two');
  expect(entryStartingAt(merged, 7)?.label).toBe('Appendix');
});

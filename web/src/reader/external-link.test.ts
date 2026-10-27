import { expect, test } from 'vitest';
import { canOpenExternally } from './external-link.ts';

test.each(['https://example.com/a?b=c#d', 'http://example.com', 'HTTPS://EXAMPLE.COM', 'mailto:someone@example.com', 'MailTo:someone@example.com'])(
  '%s can be opened',
  (url) => {
    expect(canOpenExternally(url)).toBe(true);
  },
);

test.each([
  'javascript:alert(1)',
  'JavaScript:alert(1)',
  ' javascript:alert(1)',
  'java\tscript:alert(1)',
  'data:text/html,<p>hi</p>',
  'file:///etc/passwd',
  'tel:+15551234567',
  'web+book:anything',
  'chapter-two.xhtml',
  '',
])('%j cannot be opened', (url) => {
  expect(canOpenExternally(url)).toBe(false);
});

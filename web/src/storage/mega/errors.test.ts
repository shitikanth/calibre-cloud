import { describe, expect, test } from 'vitest';
import { Aborted, Network, NotFound, QuotaExceeded } from '../adapter.ts';
import { toStorageError } from './errors.ts';

function bandwidthLimit(timeLimit: string | null) {
  return Object.assign(new Error(`Bandwidth limit reached: ${timeLimit} seconds until it resets`), { timeLimit });
}

describe('toStorageError', () => {
  test.each([
    'EOVERQUOTA (-17): Request over quota',
    'EGOINGOVERQUOTA (-24): Request failed, retrying',
    'ESHAREROVERQUOTA (-401): Share owner is over storage quota',
  ])('maps the API quota error %s to QuotaExceeded', (message) => {
    expect(toStorageError(new Error(message))).toBeInstanceOf(QuotaExceeded);
  });

  test('maps a storage host 509 to QuotaExceeded with its reset time', () => {
    const error = toStorageError(bandwidthLimit('1200'));
    expect(error).toBeInstanceOf(QuotaExceeded);
    expect((error as QuotaExceeded).retryAfter).toBe(1200);
  });

  test('leaves retryAfter unset when the 509 reset time is unreadable', () => {
    const error = toStorageError(bandwidthLimit(null));
    expect(error).toBeInstanceOf(QuotaExceeded);
    expect((error as QuotaExceeded).retryAfter).toBeUndefined();
  });

  test.each([
    'ENOENT (-9): Object (typically, node or user) not found. Wrong password?',
    'EBLOCKED (-16): User blocked',
    'EACCESS (-11): Access violation (e.g., trying to write to a read-only share)',
    'Attributes could not be decrypted with provided key.',
  ])('maps a link that no longer opens (%s) to NotFound', (message) => {
    expect(toStorageError(new Error(message))).toBeInstanceOf(NotFound);
  });

  test.each([
    ['a failed fetch', new TypeError('Failed to fetch')],
    ['a busy API', new Error('EAGAIN (-3): A temporary congestion or server malfunction prevented your request from being processed. No data was altered. Retried 4 times.')],
    ['an HTTP error from the API', new Error('Server returned error: ')],
    ['a storage host error status', new Error('MEGA returned a 503 status code')],
    ['a corrupt transfer', new Error('MAC verification failed')],
    ['an unknown failure', new Error('something else')],
    ['a thrown non-error', 'boom'],
  ])('maps %s to Network', (_case, thrown) => {
    expect(toStorageError(thrown)).toBeInstanceOf(Network);
  });

  test('passes adapter errors through unchanged', () => {
    const aborted = new Aborted();
    expect(toStorageError(aborted)).toBe(aborted);
  });
});

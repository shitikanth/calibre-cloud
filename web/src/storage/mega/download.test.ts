import { afterEach, describe, expect, test, vi } from 'vitest';
import { downloadToBlob, type DownloadOptions, type DownloadStream } from './download.ts';

const idleStream: DownloadStream = { on: () => undefined, destroy: () => undefined };

function startDownload(): DownloadOptions['handleRetries'] {
  let handleRetries: DownloadOptions['handleRetries'] | undefined;
  void downloadToBlob((options) => {
    handleRetries = options.handleRetries;
    return idleStream;
  });
  if (!handleRetries) throw new Error('download did not start');
  return handleRetries;
}

afterEach(() => {
  vi.useRealTimers();
});

describe('downloadToBlob retries', () => {
  test.each([
    ['an API quota error', new Error('EOVERQUOTA (-17): Request over quota')],
    ['a storage host 509', Object.assign(new Error('Bandwidth limit reached: 1200 seconds until it resets'), { timeLimit: '1200' })],
  ])('gives up at once on %s', (_case, error) => {
    const retry = vi.fn();

    startDownload()(1, error, retry);

    expect(retry).toHaveBeenCalledExactlyOnceWith(error);
  });

  test('retries a transport failure after a delay', () => {
    vi.useFakeTimers();
    const retry = vi.fn();

    startDownload()(1, new Error('MEGA returned a 503 status code'), retry);

    expect(retry).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2_000);
    expect(retry).toHaveBeenCalledExactlyOnceWith();
  });

  test('gives up on a transport failure after the last retry', () => {
    const retry = vi.fn();
    const error = new Error('MEGA returned a 503 status code');

    startDownload()(3, error, retry);

    expect(retry).toHaveBeenCalledExactlyOnceWith(error);
  });
});

import { afterEach, describe, expect, test, vi } from 'vitest';
import { Aborted, QuotaExceeded, type ReadOptions } from '../adapter.ts';
import { downloadToBlob, type DownloadOptions, type DownloadStream } from './download.ts';

type Events = {
  data: [chunk: Uint8Array<ArrayBuffer>];
  progress: [progress: { bytesLoaded: number; bytesTotal: number }];
  end: [];
  error: [error: unknown];
};

class FakeStream implements DownloadStream {
  destroyed = false;
  private readonly listeners: { [E in keyof Events]: ((...args: Events[E]) => void)[] } = { data: [], progress: [], end: [], error: [] };

  on<E extends keyof Events>(event: E, listener: (...args: Events[E]) => void): this {
    this.listeners[event].push(listener);
    return this;
  }

  emit<E extends keyof Events>(event: E, ...args: Events[E]): void {
    for (const listener of this.listeners[event]) listener(...args);
  }

  destroy(): void {
    this.destroyed = true;
  }
}

function startDownload(options?: ReadOptions) {
  const stream = new FakeStream();
  let handleRetries: DownloadOptions['handleRetries'] | undefined;
  const download = downloadToBlob((downloadOptions) => {
    handleRetries = downloadOptions.handleRetries;
    return stream;
  }, options);
  download.catch(() => undefined);
  if (!handleRetries) throw new Error('download did not start');
  return { stream, download, handleRetries };
}

const bytes = (text: string) => new TextEncoder().encode(text);

afterEach(() => {
  vi.useRealTimers();
});

describe('downloadToBlob', () => {
  test('collects the streamed chunks into a blob and reports progress', async () => {
    const onProgress = vi.fn();
    const { stream, download } = startDownload({ onProgress });

    stream.emit('data', bytes('hel'));
    stream.emit('progress', { bytesLoaded: 3, bytesTotal: 5 });
    stream.emit('data', bytes('lo'));
    stream.emit('end');

    await expect(download.then((blob) => blob.text())).resolves.toBe('hello');
    expect(onProgress).toHaveBeenCalledExactlyOnceWith(3, 5);
  });

  test('rejects with the mapped storage error when the stream fails', async () => {
    const { stream, download } = startDownload();

    stream.emit('error', new Error('EOVERQUOTA (-17): Request over quota'));

    await expect(download).rejects.toBeInstanceOf(QuotaExceeded);
  });

  test('never starts when the signal is already aborted', async () => {
    const start = vi.fn<(options: DownloadOptions) => DownloadStream>();
    const controller = new AbortController();
    controller.abort();

    await expect(downloadToBlob(start, { signal: controller.signal })).rejects.toBeInstanceOf(Aborted);
    expect(start).not.toHaveBeenCalled();
  });

  test('destroys the stream and stops reporting when aborted mid-download', async () => {
    const controller = new AbortController();
    const onProgress = vi.fn();
    const { stream, download } = startDownload({ signal: controller.signal, onProgress });
    stream.emit('data', bytes('hel'));

    controller.abort();
    stream.emit('progress', { bytesLoaded: 3, bytesTotal: 5 });

    await expect(download).rejects.toBeInstanceOf(Aborted);
    expect(stream.destroyed).toBe(true);
    expect(onProgress).not.toHaveBeenCalled();
  });
});

describe('downloadToBlob retries', () => {
  test.each([
    ['an API quota error', new Error('EOVERQUOTA (-17): Request over quota')],
    ['a storage host 509', Object.assign(new Error('Bandwidth limit reached: 1200 seconds until it resets'), { timeLimit: '1200' })],
  ])('gives up at once on %s', (_case, error) => {
    const retry = vi.fn();

    startDownload().handleRetries(1, error, retry);

    expect(retry).toHaveBeenCalledExactlyOnceWith(error);
  });

  test('retries a transport failure after a delay', () => {
    vi.useFakeTimers();
    const retry = vi.fn();

    startDownload().handleRetries(1, new Error('MEGA returned a 503 status code'), retry);

    expect(retry).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2_000);
    expect(retry).toHaveBeenCalledExactlyOnceWith();
  });

  test('gives up on a transport failure after the last retry', () => {
    const retry = vi.fn();
    const error = new Error('MEGA returned a 503 status code');

    startDownload().handleRetries(3, error, retry);

    expect(retry).toHaveBeenCalledExactlyOnceWith(error);
  });

  test('gives up on a transport failure once the download has finished', () => {
    const retry = vi.fn();
    const error = new Error('MEGA returned a 503 status code');
    const { stream, handleRetries } = startDownload();
    stream.emit('end');

    handleRetries(1, error, retry);

    expect(retry).toHaveBeenCalledExactlyOnceWith(error);
  });

  test('gives up on a transport failure once the download was aborted', () => {
    const retry = vi.fn();
    const error = new Error('MEGA returned a 503 status code');
    const controller = new AbortController();
    const { handleRetries } = startDownload({ signal: controller.signal });
    controller.abort();

    handleRetries(1, error, retry);

    expect(retry).toHaveBeenCalledExactlyOnceWith(error);
  });
});

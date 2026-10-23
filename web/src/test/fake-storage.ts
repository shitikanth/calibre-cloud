import {
  Aborted,
  NotFound,
  type FileStat,
  type LibraryPath,
  type ReadOptions,
  type StorageAdapter,
  type StorageError,
} from '../storage/adapter.ts';

type StoredFile = { bytes: Uint8Array<ArrayBuffer>; version: string };

export type HeldRead = {
  readonly started: Promise<void>;
  release(): void;
};

export type FakeStorageCall = { op: 'stat' | 'read'; path: LibraryPath };

export class FakeStorage implements StorageAdapter {
  readonly calls: FakeStorageCall[] = [];
  private readonly files = new Map<LibraryPath, StoredFile>();
  private readonly failures = new Map<LibraryPath, StorageError>();
  private readonly holds = new Map<string, { started: () => void; released: Promise<void> }>();

  constructor(files: Record<LibraryPath, Uint8Array<ArrayBuffer> | string> = {}) {
    for (const [path, content] of Object.entries(files)) this.put(path, content);
  }

  put(path: LibraryPath, content: Uint8Array<ArrayBuffer> | string, version = '1'): void {
    const bytes = typeof content === 'string' ? new TextEncoder().encode(content) : content;
    this.files.set(path, { bytes, version });
  }

  failWith(path: LibraryPath, error: StorageError): void {
    this.failures.set(path, error);
  }

  heal(path: LibraryPath): void {
    this.failures.delete(path);
  }

  holdNextRead(path: LibraryPath): HeldRead {
    return this.holdNext('read', path);
  }

  holdNextStat(path: LibraryPath): HeldRead {
    return this.holdNext('stat', path);
  }

  private holdNext(op: FakeStorageCall['op'], path: LibraryPath): HeldRead {
    let started!: () => void;
    let release!: () => void;
    const startedPromise = new Promise<void>((resolve) => (started = resolve));
    const released = new Promise<void>((resolve) => (release = resolve));
    this.holds.set(`${op}:${path}`, { started, released });
    return { started: startedPromise, release };
  }

  async stat(path: LibraryPath): Promise<FileStat> {
    this.calls.push({ op: 'stat', path });
    await this.waitIfHeld('stat', path);
    const file = this.lookup(path);
    return { size: file.bytes.byteLength, version: file.version };
  }

  async read(path: LibraryPath, { signal, onProgress }: ReadOptions = {}): Promise<Blob> {
    this.calls.push({ op: 'read', path });
    throwIfAborted(signal);
    const file = this.lookup(path);
    const total = file.bytes.byteLength;
    onProgress?.(Math.floor(total / 2), total);

    await this.waitIfHeld('read', path, signal);
    throwIfAborted(signal);
    onProgress?.(total, total);
    return new Blob([file.bytes]);
  }

  private async waitIfHeld(op: FakeStorageCall['op'], path: LibraryPath, signal?: AbortSignal) {
    const hold = this.holds.get(`${op}:${path}`);
    if (!hold) return;
    this.holds.delete(`${op}:${path}`);
    hold.started();
    await Promise.race([hold.released, abortion(signal)]);
  }

  private lookup(path: LibraryPath): StoredFile {
    const failure = this.failures.get(path);
    if (failure) throw failure;
    const file = this.files.get(path);
    if (!file) throw new NotFound(path);
    return file;
  }
}

function throwIfAborted(signal: AbortSignal | undefined) {
  if (signal?.aborted) throw new Aborted();
}

function abortion(signal: AbortSignal | undefined): Promise<never> {
  return new Promise((_, reject) => signal?.addEventListener('abort', () => reject(new Aborted()), { once: true }));
}

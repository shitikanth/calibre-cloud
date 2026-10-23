import { LibraryIndexError, libraryIndexError } from './errors.ts';
import type { BookSummary, CoverVersion, LibraryOperations, LibraryRequest, LibraryResponse, Operation } from './protocol.ts';

type Pending = { resolve(result: unknown): void; reject(error: Error): void };

const CLOSE_TIMEOUT_MS = 5_000;

export class LibraryIndex {
  private worker: Worker | undefined;
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();

  open(bytes: ArrayBuffer): Promise<string | null> {
    return this.call('open', { bytes }, [bytes]);
  }

  openStored(file: string): Promise<boolean> {
    return this.call('openStored', { file });
  }

  clear(): Promise<void> {
    return this.call('clear', {});
  }

  countBooks(): Promise<number> {
    return this.call('countBooks', {});
  }

  listBooks(page: { offset: number; limit: number }): Promise<BookSummary[]> {
    return this.call('listBooks', page);
  }

  listCoverVersions(): Promise<CoverVersion[]> {
    return this.call('listCoverVersions', {});
  }

  dispose(): void {
    const worker = this.worker;
    this.abandon('The library index was closed');
    if (!worker) return;
    const close = { id: this.nextId++, op: 'close' } as LibraryRequest;
    const timeout = setTimeout(() => worker.terminate(), CLOSE_TIMEOUT_MS);
    worker.onmessage = ({ data }: MessageEvent<LibraryResponse>) => {
      if (data.id !== close.id) return;
      clearTimeout(timeout);
      worker.terminate();
    };
    worker.postMessage(close);
  }

  private abandon(reason: string): void {
    this.worker = undefined;
    for (const { reject } of this.pending.values()) reject(new LibraryIndexError(reason));
    this.pending.clear();
  }

  private call<Op extends Operation>(
    op: Op,
    args: LibraryOperations[Op]['args'],
    transfer: Transferable[] = [],
  ): Promise<LibraryOperations[Op]['result']> {
    const id = this.nextId++;
    const request = { id, op, ...args } as LibraryRequest;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (result: unknown) => void, reject });
      this.ensureWorker().postMessage(request, transfer);
    });
  }

  private ensureWorker(): Worker {
    if (this.worker) return this.worker;
    const worker = new Worker(new URL('./library.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }: MessageEvent<LibraryResponse>) => {
      const pending = this.pending.get(data.id);
      if (!pending) return;
      this.pending.delete(data.id);
      if (data.ok) pending.resolve(data.result);
      else pending.reject(libraryIndexError(data.error));
    };
    worker.onerror = (event) => {
      event.preventDefault();
      worker.terminate();
      if (this.worker === worker) this.abandon(event.message || 'The library index stopped');
    };
    this.worker = worker;
    return worker;
  }
}

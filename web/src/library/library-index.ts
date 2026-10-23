import type { BookDetail, BookSummary, LibraryOperations, LibraryRequest, LibraryResponse, Operation } from './protocol.ts';

type Pending = { resolve(result: unknown): void; reject(error: Error): void };

export class LibraryIndexError extends Error {}

export class LibraryIndex {
  private worker: Worker | undefined;
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();

  open(bytes: ArrayBuffer): Promise<void> {
    return this.call('open', { bytes }, [bytes]);
  }

  countBooks(): Promise<number> {
    return this.call('countBooks', {});
  }

  listBooks(page: { offset: number; limit: number }): Promise<BookSummary[]> {
    return this.call('listBooks', page);
  }

  getBook(bookId: number): Promise<BookDetail | null> {
    return this.call('getBook', { bookId });
  }

  dispose(reason = 'The library index was closed'): void {
    this.worker?.terminate();
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
      else pending.reject(new LibraryIndexError(data.error.message));
    };
    worker.onerror = (event) => {
      event.preventDefault();
      this.dispose(event.message || 'The library index stopped');
    };
    this.worker = worker;
    return worker;
  }
}

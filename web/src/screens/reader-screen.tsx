import { Link, useNavigate } from '@tanstack/react-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { bookFilename } from '../download/save-blob.ts';
import { useDownload } from '../download/use-download.ts';
import type { BookDetail, BookFormat } from '../library/protocol.ts';
import { useLibrarySession } from '../library/session.tsx';
import { useBook } from '../library/use-book.ts';
import { useRenderers } from '../reader/context.tsx';
import type { BookRenderer, Relocation } from '../reader/renderer.ts';
import { useBookFile } from '../reader/use-book-file.ts';
import { BookNotFound, NotFound } from './book-screen.tsx';
import { ConnectedShell } from './connected-shell.tsx';
import { describeError } from './describe-error.ts';
import { LoadingLibrary } from './library-screen.tsx';
import { ProgressBar } from './progress-bar.tsx';
import { StorageErrorScreen } from './storage-error-screen.tsx';

export function ReaderScreen({ bookId, format }: { bookId: string; format: string }) {
  const { library } = useLibrarySession();

  if (library.isError)
    return (
      <ConnectedShell>
        <StorageErrorScreen error={library.error} retry={() => void library.refetch()} />
      </ConnectedShell>
    );
  if (!library.isSuccess)
    return (
      <ConnectedShell>
        <LoadingLibrary progress={library.progress} />
      </ConnectedShell>
    );
  if (!/^\d+$/.test(bookId))
    return (
      <ConnectedShell>
        <BookNotFound />
      </ConnectedShell>
    );
  return <OpenBookFormat id={Number(bookId)} formatName={format} />;
}

function OpenBookFormat({ id, formatName }: { id: number; formatName: string }) {
  const book = useBook(id);
  const renderers = useRenderers();

  if (book.isError)
    return (
      <ConnectedShell>
        <StorageErrorScreen error={book.error} retry={() => void book.refetch()} />
      </ConnectedShell>
    );
  if (book.data === null)
    return (
      <ConnectedShell>
        <BookNotFound />
      </ConnectedShell>
    );
  if (!book.data) return null;

  const format = book.data.formats.find((candidate) => candidate.format === formatName);
  if (!format || !renderers[format.format])
    return (
      <ConnectedShell>
        <NotFound title="Format not found" detail="This book has no such format to read." />
      </ConnectedShell>
    );
  return <Reader book={book.data} format={format} />;
}

function Reader({ book, format }: { book: BookDetail; format: BookFormat }) {
  const file = useBookFile(format.path);
  const navigate = useNavigate();
  const { state } = file;

  if (state.status === 'failed') {
    return (
      <ReaderShell book={book}>
        <FetchFailed book={book} error={state.error} retry={() => void file.start()} />
      </ReaderShell>
    );
  }
  if (state.status !== 'done') {
    const cancel = () => {
      file.cancel();
      void navigate({ to: '/books/$bookId', params: { bookId: String(book.id) } });
    };
    return (
      <ReaderShell book={book}>
        <section className="mx-auto flex w-full max-w-md flex-col items-center gap-4 px-4 py-12">
          <ProgressBar
            label={`Downloading ${format.format}`}
            loaded={state.status === 'fetching' ? state.loaded : 0}
            total={state.status === 'fetching' ? state.total : 0}
            className="w-full"
          />
          <button type="button" className="rounded border border-neutral-400 px-3 py-1 text-sm" onClick={cancel}>
            Cancel
          </button>
        </section>
      </ReaderShell>
    );
  }
  return <OpenedBook book={book} format={format} blob={state.result.blob} />;
}

function ReaderShell({ book, tools, children }: { book: BookDetail; tools?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex h-dvh flex-col bg-white text-neutral-900">
      <header className="flex items-center gap-2 border-b border-neutral-200 px-2 py-1">
        <Link
          to="/books/$bookId"
          params={{ bookId: String(book.id) }}
          aria-label="Back to book"
          className="rounded p-2 hover:bg-neutral-100"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5 fill-none stroke-current stroke-2">
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </Link>
        <h1 className="min-w-0 flex-1 truncate text-sm font-medium">{book.title}</h1>
        {tools}
      </header>
      {children}
    </div>
  );
}

function BackToBook({ book }: { book: BookDetail }) {
  return (
    <Link
      to="/books/$bookId"
      params={{ bookId: String(book.id) }}
      className="rounded border border-neutral-400 px-4 py-2"
    >
      Back to book
    </Link>
  );
}

function FetchFailed({ book, error, retry }: { book: BookDetail; error: Error; retry: () => void }) {
  const { title, detail, canRetry } = describeError(error, 'file');
  return (
    <section role="alert" className="mx-auto w-full max-w-md px-4 py-12">
      <h2 className="text-xl font-semibold">{title}</h2>
      <p className="mt-2 text-neutral-700">{detail}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {canRetry && (
          <button type="button" className="rounded bg-neutral-900 px-4 py-2 text-white" onClick={retry}>
            Retry
          </button>
        )}
        <BackToBook book={book} />
      </div>
    </section>
  );
}

function Unopenable({ book, format }: { book: BookDetail; format: BookFormat }) {
  const download = useDownload(format.path, bookFilename(book.title, book.authors, format.format));
  return (
    <section role="alert" className="mx-auto w-full max-w-md px-4 py-12">
      <h2 className="text-xl font-semibold">Couldn’t open this book</h2>
      <p className="mt-2 text-neutral-700">This {format.format} can’t be read here. You can still download it.</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded bg-neutral-900 px-4 py-2 text-white"
          disabled={download.state.status === 'fetching'}
          onClick={() => void download.start()}
        >
          Download {format.format}
        </button>
        <BackToBook book={book} />
      </div>
      {download.state.status === 'failed' && (
        <p className="mt-2 text-sm text-red-700">{describeError(download.state.error, 'file').title}.</p>
      )}
    </section>
  );
}

type OpenStatus = 'opening' | 'open' | 'unopenable';

function OpenedBook({ book, format, blob }: { book: BookDetail; format: BookFormat; blob: Blob }) {
  const renderers = useRenderers();
  const container = useRef<HTMLDivElement>(null);
  const [renderer, setRenderer] = useState<BookRenderer | undefined>(undefined);
  const [status, setStatus] = useState<OpenStatus>('opening');
  const [relocation, setRelocation] = useState<Relocation | undefined>(undefined);
  const [renderError, setRenderError] = useState<Error | undefined>(undefined);

  useEffect(() => {
    const factory = renderers[format.format];
    const host = container.current;
    if (!factory || !host) return;
    let cancelled = false;
    let opened: BookRenderer | undefined;
    const unsubscribe: (() => void)[] = [];
    void (async () => {
      try {
        const created = await factory();
        if (cancelled) {
          created.destroy();
          return;
        }
        opened = created;
        unsubscribe.push(created.onRelocate(setRelocation), created.onRenderError(setRenderError));
        await created.open(blob, host, {});
        if (cancelled) return;
        setRenderer(created);
        setStatus('open');
      } catch {
        if (!cancelled) setStatus('unopenable');
      }
    })();
    return () => {
      cancelled = true;
      for (const off of unsubscribe) off();
      opened?.destroy();
      host.replaceChildren();
    };
  }, [renderers, format.format, blob]);

  useEffect(() => {
    if (!renderer) return;
    const turnPage = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight') void renderer.next();
      else if (event.key === 'ArrowLeft') void renderer.previous();
    };
    window.addEventListener('keydown', turnPage);
    return () => window.removeEventListener('keydown', turnPage);
  }, [renderer]);

  return (
    <ReaderShell book={book}>
      {status === 'unopenable' && <Unopenable book={book} format={format} />}
      {renderError && status === 'open' && (
        <p role="alert" className="bg-amber-50 px-4 py-2 text-sm text-amber-900">
          This page couldn’t be shown. Keep reading from the next one.
        </p>
      )}
      <div ref={container} className="min-h-0 flex-1 overflow-hidden" hidden={status === 'unopenable'} />
      {status === 'open' && renderer && (
        <nav aria-label="Pages" className="flex items-center justify-between gap-2 border-t border-neutral-200 px-2 py-1">
          <button type="button" className="rounded px-3 py-1 hover:bg-neutral-100" onClick={() => void renderer.previous()}>
            Previous
          </button>
          <span className="text-sm text-neutral-600">{progressText(relocation)}</span>
          <button type="button" className="rounded px-3 py-1 hover:bg-neutral-100" onClick={() => void renderer.next()}>
            Next
          </button>
        </nav>
      )}
    </ReaderShell>
  );
}

function progressText(relocation: Relocation | undefined): string {
  if (!relocation) return '';
  if (relocation.page) return `page ${relocation.page.current} of ${relocation.page.total}`;
  return `${Math.round(relocation.fraction * 100)}%`;
}

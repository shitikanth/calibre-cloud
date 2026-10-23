import { Link, useNavigate } from '@tanstack/react-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { bookFilename } from '../download/save-blob.ts';
import { useDownload } from '../download/use-download.ts';
import type { BookDetail, BookFormat } from '../library/protocol.ts';
import { forgetBookFile } from '../reader/book-cache.ts';
import { useRenderers } from '../reader/context.tsx';
import { loadReaderSettings, saveReaderSettings, type ReaderSettings } from '../reader/reader-settings.ts';
import type { BookRenderer, ReaderTheme, Relocation } from '../reader/renderer.ts';
import { useBookFile } from '../reader/use-book-file.ts';
import { NotFound, OpenBook } from './book-screen.tsx';
import { ConnectedShell } from './connected-shell.tsx';
import { describeError } from './describe-error.ts';
import { ProgressBar } from './progress-bar.tsx';
import { SettingsTool } from './reader-settings-tool.tsx';
import { TocTool } from './reader-toc.tsx';

export function ReaderScreen({ bookId, format }: { bookId: string; format: string }) {
  return (
    <OpenBook bookId={bookId} frame={inShell}>
      {(book) => <ReaderForFormat book={book} formatName={format} />}
    </OpenBook>
  );
}

function inShell(fallback: ReactNode) {
  return <ConnectedShell>{fallback}</ConnectedShell>;
}

function ReaderForFormat({ book, formatName }: { book: BookDetail; formatName: string }) {
  const renderers = useRenderers();
  const format = book.formats.find((candidate) => candidate.format === formatName);
  if (!format || !renderers[format.format])
    return inShell(<NotFound title="Format not found" detail="This book has no such format to read." />);
  return <Reader book={book} format={format} />;
}

function Reader({ book, format }: { book: BookDetail; format: BookFormat }) {
  const file = useBookFile({ bookId: book.id, format: format.format, path: format.path });
  const navigate = useNavigate();
  const [settings, setSettings] = useState(loadReaderSettings);
  const { state } = file;

  const changeSettings = (next: ReaderSettings) => {
    saveReaderSettings(next);
    setSettings(next);
  };

  if (state.status === 'failed') {
    return (
      <ReaderShell book={book} theme={settings.theme}>
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
      <ReaderShell book={book} theme={settings.theme}>
        <section className="mx-auto flex w-full max-w-md flex-col items-center gap-4 px-4 py-12">
          <ProgressBar
            label={`Downloading ${format.format}`}
            loaded={state.status === 'fetching' ? state.loaded : 0}
            total={state.status === 'fetching' ? state.total : 0}
            className="w-full"
          />
          <button type="button" className="rounded border border-(--reader-line) px-3 py-1 text-sm" onClick={cancel}>
            Cancel
          </button>
        </section>
      </ReaderShell>
    );
  }
  return (
    <OpenedBook
      key={`${book.id}/${format.format}`}
      book={book}
      format={format}
      blob={state.result.blob}
      settings={settings}
      onSettingsChange={changeSettings}
    />
  );
}

type ReaderShellProps = { book: BookDetail; theme: ReaderTheme; tools?: ReactNode; children: ReactNode };

function ReaderShell({ book, theme, tools, children }: ReaderShellProps) {
  return (
    <div className="reader flex h-dvh flex-col" data-theme={theme}>
      <header className="flex items-center gap-2 border-b border-(--reader-line) px-2 py-1">
        <Link
          to="/books/$bookId"
          params={{ bookId: String(book.id) }}
          aria-label="Back to book"
          className="rounded p-2 hover:bg-(--reader-hover)"
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
      className="rounded border border-(--reader-line) px-4 py-2"
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
      <p className="mt-2 text-(--reader-muted)">{detail}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {canRetry && (
          <button type="button" className="rounded bg-(--reader-fg) px-4 py-2 text-(--reader-bg)" onClick={retry}>
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
      <p className="mt-2 text-(--reader-muted)">This {format.format} can’t be read here. You can still download it.</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded bg-(--reader-fg) px-4 py-2 text-(--reader-bg)"
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

type OpenedBookProps = {
  book: BookDetail;
  format: BookFormat;
  blob: Blob;
  settings: ReaderSettings;
  onSettingsChange: (settings: ReaderSettings) => void;
};

function OpenedBook({ book, format, blob, settings, onSettingsChange }: OpenedBookProps) {
  const renderers = useRenderers();
  const container = useRef<HTMLDivElement>(null);
  const [renderer, setRenderer] = useState<BookRenderer | undefined>(undefined);
  const [status, setStatus] = useState<OpenStatus>('opening');
  const [relocation, setRelocation] = useState<Relocation | undefined>(undefined);
  const [renderError, setRenderError] = useState<Error | undefined>(undefined);
  const [zoom, setZoom] = useState(1);

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
        unsubscribe.push(
          created.onRelocate((next) => {
            setRelocation(next);
            setRenderError(undefined);
          }),
          created.onRenderError(setRenderError),
        );
        await created.open(blob, host, {});
        if (cancelled) return;
        setRenderer(created);
        setStatus('open');
      } catch {
        if (cancelled) return;
        setStatus('unopenable');
        void forgetBookFile(book.id, format.format);
      }
    })();
    return () => {
      cancelled = true;
      for (const off of unsubscribe) off();
      opened?.destroy();
      host.replaceChildren();
    };
  }, [renderers, book.id, format.format, blob]);

  useEffect(() => {
    renderer?.setStyles?.(settings);
  }, [renderer, settings]);

  const changeZoom = (next: number) => {
    setZoom(next);
    renderer?.setZoom?.(next);
  };

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
    <ReaderShell
      book={book}
      theme={settings.theme}
      tools={
        status === 'open' &&
        renderer && (
          <>
            <TocTool renderer={renderer} />
            <SettingsTool
              renderer={renderer}
              settings={settings}
              onSettingsChange={onSettingsChange}
              zoom={zoom}
              onZoomChange={changeZoom}
            />
          </>
        )
      }
    >
      {status === 'unopenable' && <Unopenable book={book} format={format} />}
      {renderError && status === 'open' && (
        <p role="alert" className="bg-amber-50 px-4 py-2 text-sm text-amber-900">
          This page couldn’t be shown. Keep reading from the next one.
        </p>
      )}
      <div ref={container} className="min-h-0 flex-1 overflow-hidden" hidden={status === 'unopenable'} />
      {status === 'open' && renderer && (
        <nav aria-label="Pages" className="flex items-center justify-between gap-2 border-t border-(--reader-line) px-2 py-1">
          <button type="button" className="rounded px-3 py-1 hover:bg-(--reader-hover)" onClick={() => void renderer.previous()}>
            Previous
          </button>
          <span className="text-sm text-(--reader-muted)">{progressText(relocation)}</span>
          <button type="button" className="rounded px-3 py-1 hover:bg-(--reader-hover)" onClick={() => void renderer.next()}>
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

import { Link, useNavigate } from '@tanstack/react-router';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { bookFilename } from '../download/save-blob.ts';
import { useDownload } from '../download/use-download.ts';
import type { BookDetail, BookFormat } from '../library/protocol.ts';
import { forgetBookFile } from '../reader/book-cache.ts';
import { useRenderers } from '../reader/context.tsx';
import { loadPosition, trackPosition } from '../reader/positions.ts';
import { loadReaderSettings, saveReaderSettings, type ReaderSettings } from '../reader/reader-settings.ts';
import type { BookRenderer, ReaderTheme, Relocation } from '../reader/renderer.ts';
import type { SwipeDirection } from '../reader/swipe.ts';
import { useBookFile } from '../reader/use-book-file.ts';
import { NotFound, OpenBook } from './book-screen.tsx';
import { ConnectedShell } from './connected-shell.tsx';
import { describeError } from './describe-error.ts';
import { ExternalLinkDialog } from './external-link-dialog.tsx';
import { formatSize } from './format.ts';
import { ProgressBar } from './progress-bar.tsx';
import { BackToBookLink, BottomBar, HotEdge, TapZone, TopBar, type ControlsState } from './reader-controls.tsx';
import { placeLabel, positionLabel, SeekBar } from './reader-seek-bar.tsx';
import { SettingsTool } from './reader-settings-tool.tsx';
import { TocTool } from './reader-toc.tsx';
import { useWide } from './use-wide.ts';

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
  return <Reader key={`${book.id}/${format.format}`} book={book} format={format} />;
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
    const label = format.size > 0 ? `Downloading ${format.format} · ${formatSize(format.size)}` : `Downloading ${format.format}`;
    return (
      <ReaderShell book={book} theme={settings.theme}>
        <section className="mx-auto flex w-full max-w-md flex-col items-center gap-4 px-4 py-12">
          <p className="text-sm text-(--reader-muted)">{label}</p>
          <ProgressBar
            label={label}
            loaded={state.status === 'fetching' ? state.loaded : 0}
            total={state.status === 'fetching' ? state.total : 0}
            className="w-full"
          />
          <button type="button" className="min-h-11 rounded border border-(--reader-line) px-3 py-1 text-sm" onClick={cancel}>
            Cancel
          </button>
        </section>
      </ReaderShell>
    );
  }
  return (
    <OpenedBook
      book={book}
      format={format}
      blob={state.result.blob}
      settings={settings}
      onSettingsChange={changeSettings}
    />
  );
}

function ReaderShell({ book, theme, children }: { book: BookDetail; theme: ReaderTheme; children: ReactNode }) {
  return (
    <div className="reader flex h-dvh flex-col" data-theme={theme}>
      <header className="flex items-center gap-2 border-b border-(--reader-line) px-2 py-1">
        <BackToBookLink book={book} />
        <h1 className="min-w-0 flex-1 truncate text-sm font-medium">{book.title}</h1>
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

function RendererUnavailable({ book, retry }: { book: BookDetail; retry: () => void }) {
  return (
    <section role="alert" className="mx-auto w-full max-w-md px-4 py-12">
      <h2 className="text-xl font-semibold">Couldn’t load the reader</h2>
      <p className="mt-2 text-(--reader-muted)">Check your internet connection and try again.</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className="rounded bg-(--reader-fg) px-4 py-2 text-(--reader-bg)" onClick={retry}>
          Retry
        </button>
        <BackToBook book={book} />
      </div>
    </section>
  );
}

type OpenStatus = 'opening' | 'open' | 'unopenable' | 'renderer-unavailable';

type OpenedBookProps = {
  book: BookDetail;
  format: BookFormat;
  blob: Blob;
  settings: ReaderSettings;
  onSettingsChange: (settings: ReaderSettings) => void;
};

function OpenedBook({ book, format, blob, settings, onSettingsChange }: OpenedBookProps) {
  const renderers = useRenderers();
  const shell = useRef<HTMLDivElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const [renderer, setRenderer] = useState<BookRenderer | undefined>(undefined);
  const [status, setStatus] = useState<OpenStatus>('opening');
  const [relocation, setRelocation] = useState<Relocation | undefined>(undefined);
  const [renderError, setRenderError] = useState<Error | undefined>(undefined);
  const [externalLink, setExternalLink] = useState<string | undefined>(undefined);
  const [zoom, setZoom] = useState(1);
  const [attempt, setAttempt] = useState(0);
  const [controls, setControls] = useState<ControlsState>('hidden');
  const wide = useWide();

  useEffect(() => {
    const factory = renderers[format.format];
    const host = container.current;
    if (!factory || !host) return;
    let cancelled = false;
    let opened: BookRenderer | undefined;
    const unsubscribe: (() => void)[] = [];
    const key = { bookId: book.id, format: format.format };
    const position = trackPosition(key);
    const saved = loadPosition(key);
    void (async () => {
      let created: BookRenderer;
      try {
        created = await factory();
      } catch {
        if (!cancelled) setStatus('renderer-unavailable');
        return;
      }
      if (cancelled) {
        created.destroy();
        return;
      }
      try {
        opened = created;
        unsubscribe.push(
          created.onRelocate((next) => {
            position.relocate(next);
            setRelocation(next);
            setRenderError(undefined);
          }),
          created.onRenderError(setRenderError),
          created.onExternalLink(setExternalLink),
        );
        await created.open(blob, host, saved ? { location: saved.location } : {});
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
      position.close();
      opened?.destroy();
      host.replaceChildren();
    };
  }, [renderers, book.id, format.format, blob, attempt]);

  useEffect(() => {
    renderer?.setStyles?.(settings);
  }, [renderer, settings]);

  const retryLoading = () => {
    setStatus('opening');
    setAttempt((count) => count + 1);
  };

  const changeZoom = (next: number) => {
    setZoom(next);
    renderer?.setZoom?.(next);
  };

  const turn = useCallback(
    (direction: SwipeDirection) => {
      setControls('hidden');
      void (direction === 'next' ? renderer?.next() : renderer?.previous());
    },
    [renderer],
  );

  useEffect(() => {
    if (!renderer) return;
    const offs = [
      renderer.onTap(() => setControls((state) => (state === 'hidden' ? 'pinned' : 'hidden'))),
      renderer.onTurn(() => setControls('hidden')),
    ];
    return () => {
      for (const off of offs) off();
    };
  }, [renderer]);

  useEffect(() => {
    if (!renderer) return;
    const onKey = (event: KeyboardEvent) => {
      if (shell.current?.querySelector('[aria-expanded="true"], dialog[open]')) return;
      if (event.key === 'Escape') setControls('hidden');
      else if (event.target instanceof HTMLInputElement) return;
      else if (event.key === 'ArrowRight') turn('next');
      else if (event.key === 'ArrowLeft') turn('previous');
    };
    // Capture: a popover's own Escape handler closes it first otherwise, and this would hide the controls too.
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [renderer, turn]);

  const reading = status === 'open' && renderer ? renderer : undefined;
  const shown = !reading || controls !== 'hidden';
  const toggle = () => setControls((state) => (state === 'hidden' ? 'pinned' : 'hidden'));
  const pin = () => setControls('pinned');
  const peek = () => setControls((state) => (state === 'hidden' ? 'peek' : state));
  const unpeek = () => setControls((state) => (state === 'peek' ? 'hidden' : state));
  const placement = wide ? 'below' : 'above';
  const tools = reading && (
    <>
      <TocTool renderer={reading} current={relocation?.tocEntry} placement={placement} />
      {(reading.setStyles || reading.setZoom) && (
        <SettingsTool
          renderer={reading}
          settings={settings}
          onSettingsChange={onSettingsChange}
          zoom={zoom}
          onZoomChange={changeZoom}
          placement={placement}
        />
      )}
    </>
  );
  const marginClass = `h-8 shrink-0 truncate px-16 text-center text-xs leading-8 text-(--reader-muted) ${shown ? 'invisible' : ''}`;

  return (
    <div ref={shell} className="reader relative h-dvh overflow-hidden" data-theme={settings.theme}>
      <TopBar book={book} tools={tools} wide={wide} shown={shown} onPin={pin} onLeave={unpeek} />
      <main className="group/page relative flex h-full flex-col" onPointerEnter={unpeek}>
        <p aria-hidden="true" className={marginClass} onClick={toggle}>
          {reading && (relocation?.tocEntry?.label ?? book.title)}
        </p>
        {status === 'unopenable' && <Unopenable book={book} format={format} />}
        {status === 'renderer-unavailable' && <RendererUnavailable book={book} retry={retryLoading} />}
        {renderError && reading && (
          <p role="alert" className="bg-amber-50 px-4 py-2 text-sm text-amber-900">
            This page couldn’t be shown. Keep reading from the next one.
          </p>
        )}
        <div ref={container} className="min-h-0 flex-1 overflow-hidden" hidden={status === 'unopenable' || status === 'renderer-unavailable'} />
        <p aria-hidden="true" className={marginClass} onClick={toggle}>
          {reading && positionLabel(relocation)}
        </p>
        {reading && (
          <>
            <TapZone direction="previous" onTurn={turn} />
            <TapZone direction="next" onTurn={turn} />
          </>
        )}
      </main>
      {reading && (
        <>
          {wide && <HotEdge edge="top" onReach={peek} />}
          {wide && <HotEdge edge="bottom" onReach={peek} />}
          <BottomBar
            seekBar={<SeekBar renderer={reading} relocation={relocation} />}
            place={placeLabel(relocation)}
            tools={tools}
            wide={wide}
            shown={shown}
            onPin={pin}
            onLeave={unpeek}
          />
        </>
      )}
      {externalLink !== undefined && <ExternalLinkDialog url={externalLink} onClose={() => setExternalLink(undefined)} />}
    </div>
  );
}

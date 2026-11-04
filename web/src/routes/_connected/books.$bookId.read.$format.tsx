import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type MouseEvent, type PointerEvent, type ReactNode } from 'react';
import { bookFilename } from '../../download/save-blob.ts';
import { useDownload } from '../../download/use-download.ts';
import type { BookDetail, BookFormat } from '../../library/protocol.ts';
import { forgetBookFile } from '../../reader/book-cache.ts';
import { useRenderers } from '../../reader/context.tsx';
import { trackJumps, type Jumps, type JumpTarget } from '../../reader/jumps.ts';
import { loadPosition, trackPosition } from '../../reader/positions.ts';
import { loadReaderSettings, saveReaderSettings, type ReaderSettings } from '../../reader/reader-settings.ts';
import type { BookRenderer, ReaderTheme, Relocation, SearchResult } from '../../reader/renderer.ts';
import type { SwipeDirection } from '../../reader/swipe.ts';
import { adjacentEntry } from '../../reader/toc.ts';
import { useBookFile } from '../../reader/use-book-file.ts';
import { fallback, NotFound, useOpenBook, type Fallback } from './-shared/open-book.tsx';
import { ConnectedShell } from './-shared/connected-shell.tsx';
import { describeError } from '../-describe-error.ts';
import { ExternalLinkDialog } from './-reader/external-link-dialog.tsx';
import { formatSize } from './-shared/format.ts';
import { ProgressBar } from './-shared/progress-bar.tsx';
import { BackToBookLink, BottomBar, JumpBack, TapZone, TopBar, zoneAt, type ControlsState } from './-reader/reader-controls.tsx';
import { readerKeyAction, type ReaderKeyAction, type ReaderTool } from './-reader/reader-keys.ts';
import type { PopoverToggle } from './-reader/reader-popover.tsx';
import { adjacentHit, SearchTool, useBookSearch, useHighlights } from './-reader/reader-search.tsx';
import { backLabel, whereYouAreLabel, positionLabel, SeekBar } from './-reader/reader-seek-bar.tsx';
import { SettingsTool } from './-reader/reader-settings-tool.tsx';
import { TocTool } from './-reader/reader-toc.tsx';
import { ReconnectLink } from './-shared/reconnect-link.tsx';
import { dialogOpen } from './-shared/shortcut-keys.ts';
import { SignInProblem } from '../-sign-in-outcome.tsx';
import { useWide } from './-reader/use-wide.ts';

export const Route = createFileRoute('/_connected/books/$bookId/read/$format')({
  component: ReaderRoute,
});

function ReaderRoute() {
  const { bookId, format } = Route.useParams();
  const target = useReaderTarget(bookId, format);
  if (!target.ready) return <ConnectedShell>{target.fallback}</ConnectedShell>;
  return <Reader key={`${target.book.id}/${target.format.format}`} book={target.book} format={target.format} />;
}

type ReaderTarget = { ready: true; book: BookDetail; format: BookFormat } | Fallback;

function useReaderTarget(bookId: string, formatName: string): ReaderTarget {
  const opened = useOpenBook(bookId);
  const renderers = useRenderers();
  if (!opened.ready) return opened;
  const format = opened.book.formats.find((candidate) => candidate.format === formatName);
  if (!format || !renderers[format.format])
    return fallback(<NotFound title="Format not found" detail="This book has no such format to read." />);
  return { ready: true, book: opened.book, format };
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
  if (state.status === 'idle' || state.status === 'checking') return <ReaderShell book={book} theme={settings.theme} />;
  if (state.status === 'fetching') {
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
            loaded={state.loaded}
            total={state.total}
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

function ReaderShell({ book, theme, children }: { book: BookDetail; theme: ReaderTheme; children?: ReactNode }) {
  return (
    <div className="reader flex h-dvh flex-col safe-area-padding" data-theme={theme}>
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
  const { title, detail, canRetry, canReconnect } = describeError(error, 'file');
  return (
    <section role="alert" className="mx-auto w-full max-w-md px-4 py-12">
      <h2 className="text-xl font-semibold">{title}</h2>
      <p className="mt-2 text-(--reader-muted)">{detail}</p>
      {canReconnect && <SignInProblem className="mt-2" announce={false} />}
      <div className="mt-4 flex flex-wrap gap-2">
        {canReconnect && <ReconnectLink className="rounded bg-(--reader-fg) px-4 py-2 text-(--reader-bg)" />}
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
        <DownloadFailed error={download.state.error} />
      )}
    </section>
  );
}

function DownloadFailed({ error }: { error: Error }) {
  const { title, canReconnect } = describeError(error, 'file');
  return (
    <p className="mt-2 text-sm text-red-700">
      {title}. {canReconnect && <ReconnectLink className="underline" />}
    </p>
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


function toggled(state: ControlsState): ControlsState {
  return state === 'hidden' ? 'pinned' : 'hidden';
}

function turnPage(renderer: BookRenderer, jumps: Jumps, direction: SwipeDirection) {
  jumps.turn();
  return direction === 'next' ? renderer.next() : renderer.previous();
}

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
  const [tool, setTool] = useState<ReaderTool | undefined>(undefined);
  const [jumps] = useState(trackJumps);
  const origin = useSyncExternalStore(jumps.subscribe, () => jumps.origin);
  const wide = useWide();
  const highlights = useHighlights();

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
            jumps.relocate(next);
            setRelocation(next);
            setRenderError(undefined);
          }),
          created.onRenderError(setRenderError),
          created.onExternalLink(setExternalLink),
          created.onTap(({ x }) => {
            highlights.clear();
            const zone = zoneAt(x, host);
            setControls(zone ? 'hidden' : toggled);
            if (zone) void turnPage(created, jumps, zone);
          }),
          created.onTurn(() => {
            highlights.clear();
            jumps.turn();
            setControls('hidden');
          }),
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
  }, [renderers, book.id, format.format, blob, attempt, jumps, highlights]);

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
      highlights.clear();
      setControls('hidden');
      if (renderer) void turnPage(renderer, jumps, direction);
    },
    [renderer, jumps, highlights],
  );

  const jump = useCallback(
    (target: JumpTarget) => {
      highlights.clear();
      return jumps.jump(() => {
        if (!renderer) return Promise.resolve();
        return 'fraction' in target ? renderer.goToFraction(target.fraction) : renderer.goTo(target.location);
      });
    },
    [renderer, jumps, highlights],
  );

  const goBack = useCallback(() => {
    highlights.clear();
    if (renderer) void jumps.back((location) => renderer.goTo(location));
  }, [renderer, jumps, highlights]);

  const reading = status === 'open' && renderer ? renderer : undefined;
  const search = useBookSearch(reading?.search);
  const { state: searchState, pick: pickHit } = search;

  const showHit = useCallback(
    (on: BookRenderer, result: SearchResult, results: readonly SearchResult[]) => {
      setControls('hidden');
      highlights.show(on, result, results, jump({ location: result.location }));
    },
    [highlights, jump],
  );

  const openTool = useCallback((name: ReaderTool) => {
    setControls('pinned');
    setTool(name);
  }, []);

  useEffect(() => {
    if (!renderer) return;
    const goToChapter = (direction: SwipeDirection) => {
      const entry = adjacentEntry(renderer.toc, relocation?.tocEntry, direction);
      if (entry) void jump({ location: entry.location });
      return true;
    };
    const stepMatch = (direction: SwipeDirection) => {
      const hit = adjacentHit(searchState, direction);
      if (hit) {
        pickHit(hit);
        showHit(renderer, hit, searchState.results);
      }
      return true;
    };
    const actions: Record<ReaderKeyAction, () => boolean> = {
      hideControls: () => {
        setControls('hidden');
        return false;
      },
      nextPage: () => {
        turn('next');
        return true;
      },
      previousPage: () => {
        turn('previous');
        return true;
      },
      toggleContents: () => {
        if (tool === 'toc') setTool(undefined);
        else openTool('toc');
        return true;
      },
      openSearch: () => {
        if (!renderer.search) return false;
        openTool('search');
        return true;
      },
      focusSearch: () => {
        shell.current?.querySelector<HTMLInputElement>('[role="search"] input')?.focus();
        return true;
      },
      nextChapter: () => goToChapter('next'),
      previousChapter: () => goToChapter('previous'),
      nextMatch: () => stepMatch('next'),
      previousMatch: () => stepMatch('previous'),
      goBack: () => {
        if (!origin) return false;
        goBack();
        return true;
      },
    };
    const onKey = (event: KeyboardEvent) => {
      if (dialogOpen()) return;
      const action = readerKeyAction(event, tool);
      if (action && actions[action]()) event.preventDefault();
    };
    // Capture: a popover's own Escape handler closes it first otherwise, and this would hide the controls too.
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [renderer, turn, tool, openTool, relocation, jump, searchState, pickHit, showHit, origin, goBack]);

  const shown = !reading || controls !== 'hidden';
  const tapMargin = (event: MouseEvent<HTMLElement>) => {
    const zone = zoneAt(event.clientX, container.current);
    if (zone) turn(zone);
    else {
      highlights.clear();
      setControls(toggled);
    }
  };
  const pin = () => setControls('pinned');
  const unpeek = () => setControls((state) => (state === 'peek' ? 'hidden' : state));
  const peekAtEdge = (event: PointerEvent<HTMLElement>) => {
    const edge = 24;
    if (!wide || event.pointerType !== 'mouse' || (event.clientY > edge && event.clientY < window.innerHeight - edge)) return;
    setControls((state) => (state === 'hidden' ? 'peek' : state));
  };
  const placement = wide ? 'below' : 'above';
  const toggle = (name: ReaderTool): PopoverToggle => ({
    open: tool === name,
    setOpen: (next) =>
      setTool((current) => {
        const open = typeof next === 'function' ? next(current === name) : next;
        if (open) return name;
        return current === name ? undefined : current;
      }),
  });
  const tools = reading && (
    <>
      <TocTool renderer={reading} jump={jump} current={relocation?.tocEntry} placement={placement} toggle={toggle('toc')} />
      {reading.search && (
        <SearchTool
          control={search}
          placement={placement}
          toggle={toggle('search')}
          onPick={(result) => {
            showHit(reading, result, search.state.results);
          }}
        />
      )}
      {(reading.setStyles || reading.setZoom) && (
        <SettingsTool
          renderer={reading}
          settings={settings}
          onSettingsChange={onSettingsChange}
          zoom={zoom}
          onZoomChange={changeZoom}
          placement={placement}
          toggle={toggle('settings')}
        />
      )}
    </>
  );
  const runningHeadAndFolioClass = `h-8 shrink-0 truncate px-16 text-center text-xs leading-8 text-(--reader-muted) ${shown ? 'invisible' : ''}`;

  return (
    <div ref={shell} className="reader relative h-dvh overflow-hidden safe-area-padding" data-theme={settings.theme}>
      <TopBar book={book} tools={tools} wide={wide} shown={shown} onPin={pin} onLeave={unpeek} />
      <main className="group/page relative flex h-full flex-col" onPointerEnter={unpeek} onPointerMove={peekAtEdge}>
        <p aria-hidden="true" className={runningHeadAndFolioClass} onClick={tapMargin}>
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
        <p aria-hidden="true" className={runningHeadAndFolioClass} onClick={tapMargin}>
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
          <BottomBar
            seekBar={<SeekBar renderer={reading} jump={jump} relocation={relocation} />}
            whereYouAre={whereYouAreLabel(relocation)}
            back={origin && <JumpBack label={backLabel(origin)} onBack={goBack} />}
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

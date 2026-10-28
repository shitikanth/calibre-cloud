import { Link } from '@tanstack/react-router';
import { bookFilename } from '../download/save-blob.ts';
import { useDownload, type DownloadState } from '../download/use-download.ts';
import type { BookDetail, BookFormat } from '../library/protocol.ts';
import { useRenderers } from '../reader/context.tsx';
import { describeError } from './describe-error.ts';
import { formatSize } from './format.ts';
import { ReconnectLink } from './reconnect-link.tsx';
import { ProgressBar } from './progress-bar.tsx';

export function FormatList({ book }: { book: BookDetail }) {
  if (book.formats.length === 0) return <p className="text-sm text-neutral-600">No files for this book.</p>;
  return (
    <ul aria-label="Formats" className="flex flex-col gap-3">
      {book.formats.map((format) => (
        <FormatItem
          key={format.format}
          bookId={book.id}
          format={format}
          filename={bookFilename(book.title, book.authors, format.format)}
        />
      ))}
    </ul>
  );
}

function FormatItem({ bookId, format, filename }: { bookId: number; format: BookFormat; filename: string }) {
  const renderers = useRenderers();
  const download = useDownload(format.path, filename);
  const { state } = download;
  const downloadLabel = `Download ${format.format}`;
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded border border-neutral-300 px-3 py-2">
      <span className="font-medium">{format.format}</span>
      <span className="text-sm text-neutral-600">{formatSize(format.size)}</span>
      <span className="ml-auto flex items-center gap-2">
        {renderers[format.format] && (
          <Link
            to="/books/$bookId/read/$format"
            params={{ bookId: String(bookId), format: format.format }}
            aria-label={`Read ${format.format}`}
            className="inline-flex min-h-11 items-center rounded bg-neutral-900 px-4 text-sm text-white sm:min-h-9"
          >
            Read
          </Link>
        )}
        {state.status === 'fetching' ? (
          <DownloadingFormat format={format.format} state={state} cancel={download.cancel} />
        ) : (
          <button
            type="button"
            aria-label={downloadLabel}
            title={downloadLabel}
            className="flex size-11 items-center justify-center rounded border border-neutral-400 sm:size-9"
            onClick={() => void download.start()}
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5 fill-none stroke-current stroke-2">
              <path d="M12 4v11m-5-5 5 5 5-5M5 20h14" />
            </svg>
          </button>
        )}
      </span>
      {state.status === 'failed' && (
        <p role="alert" className="w-full text-sm text-red-700">
          <DownloadError error={state.error} />
        </p>
      )}
    </li>
  );
}

type Downloading = Extract<DownloadState, { status: 'fetching' }>;

function DownloadingFormat({ format, state, cancel }: { format: string; state: Downloading; cancel: () => void }) {
  return (
    <span className="flex items-center gap-2">
      <ProgressBar label={`Downloading ${format}`} loaded={state.loaded} total={state.total} className="w-36" />
      <button type="button" className="inline-flex min-h-11 items-center rounded border border-neutral-400 px-3 text-sm sm:min-h-9" onClick={cancel}>
        Cancel
      </button>
    </span>
  );
}

function DownloadError({ error }: { error: Error }) {
  const { title, detail, canReconnect } = describeError(error, 'file');
  return (
    <>
      <span className="font-medium">{title}.</span> {detail}{' '}
      {canReconnect && <ReconnectLink className="font-medium underline" />}
    </>
  );
}

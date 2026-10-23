import { bookFilename } from '../download/save-blob.ts';
import { useDownload, type DownloadState } from '../download/use-download.ts';
import type { BookDetail, BookFormat } from '../library/protocol.ts';
import { Network, NotFound, QuotaExceeded, ReconnectRequired } from '../storage/adapter.ts';
import { formatSize } from './format.ts';

export function FormatList({ book }: { book: BookDetail }) {
  if (book.formats.length === 0) return <p className="mt-6 text-sm text-neutral-600">No files for this book.</p>;
  return (
    <ul aria-label="Formats" className="mt-6 flex flex-col gap-3">
      {book.formats.map((format) => (
        <FormatItem key={format.format} format={format} filename={bookFilename(book.title, book.authors, format.format)} />
      ))}
    </ul>
  );
}

function FormatItem({ format, filename }: { format: BookFormat; filename: string }) {
  const download = useDownload(format.path, filename);
  const { state } = download;
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded border border-neutral-300 px-3 py-2">
      <span className="font-medium">{format.format}</span>
      <span className="text-sm text-neutral-600">{formatSize(format.size)}</span>
      {state.status === 'downloading' ? (
        <DownloadProgress format={format.format} state={state} cancel={download.cancel} />
      ) : (
        <button
          type="button"
          className="ml-auto rounded bg-neutral-900 px-3 py-1 text-sm text-white"
          onClick={() => void download.start()}
        >
          Download {format.format}
        </button>
      )}
      {state.status === 'failed' && (
        <p role="alert" className="w-full text-sm text-red-700">
          {describeDownloadError(state.error)}
        </p>
      )}
    </li>
  );
}

type Downloading = Extract<DownloadState, { status: 'downloading' }>;

function DownloadProgress({ format, state, cancel }: { format: string; state: Downloading; cancel: () => void }) {
  const percent = state.total > 0 ? Math.floor((state.loaded / state.total) * 100) : undefined;
  return (
    <span className="ml-auto flex items-center gap-2">
      <progress
        aria-label={`Downloading ${format}`}
        className="w-24"
        max={100}
        {...(percent === undefined ? {} : { value: percent })}
      />
      {percent !== undefined && <span className="text-sm text-neutral-600">{percent}%</span>}
      <button type="button" className="rounded border border-neutral-400 px-3 py-1 text-sm" onClick={cancel}>
        Cancel
      </button>
    </span>
  );
}

function describeDownloadError(error: Error): string {
  if (error instanceof NotFound) return 'This file is missing from your library.';
  if (error instanceof QuotaExceeded) return 'Download quota exceeded. Try later.';
  if (error instanceof Network) return 'Couldn’t reach your library. Check your connection and try again.';
  if (error instanceof ReconnectRequired) return 'Your access has expired. Connect again.';
  return `The download failed: ${error.message}`;
}

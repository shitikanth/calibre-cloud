import { LibraryInUse } from '../library/errors.ts';
import { Aborted, Network, NotFound, QuotaExceeded, ReconnectRequired } from '../storage/adapter.ts';

export type ErrorCopy = { title: string; detail: string; canRetry: boolean; canSwitchLibrary: boolean };

export type ErrorSubject = 'library' | 'file';

export function describeError(error: Error, subject: ErrorSubject): ErrorCopy {
  const library = subject === 'library';
  if (error instanceof LibraryInUse)
    return {
      title: 'Library is open in another tab',
      detail: 'This browser can show the library in one tab at a time. Close the other tab, then try again.',
      canRetry: true,
      canSwitchLibrary: false,
    };
  if (error instanceof NotFound)
    return library
      ? {
          title: 'Wrong folder',
          detail:
            'This folder has no metadata.db at its root, or it can no longer be opened. Connect the folder Calibre uses as its library.',
          canRetry: false,
          canSwitchLibrary: true,
        }
      : { title: 'File missing', detail: 'This file is missing from your library.', canRetry: false, canSwitchLibrary: true };
  if (error instanceof QuotaExceeded)
    return {
      title: 'Download quota exceeded',
      detail: 'Your storage provider has paused downloads for now. Try later.',
      canRetry: true,
      canSwitchLibrary: true,
    };
  if (error instanceof Network)
    return {
      title: 'Couldn’t reach your library',
      detail: 'Check your internet connection and try again.',
      canRetry: true,
      canSwitchLibrary: true,
    };
  if (error instanceof ReconnectRequired)
    return {
      title: 'Reconnect your library',
      detail: 'Your access has expired. Connect again.',
      canRetry: false,
      canSwitchLibrary: true,
    };
  if (error instanceof Aborted)
    return {
      title: library ? 'Loading stopped' : 'Download stopped',
      detail: 'It was cancelled.',
      canRetry: true,
      canSwitchLibrary: true,
    };
  return {
    title: library ? 'Couldn’t open this library' : 'The download failed',
    detail: error.message,
    canRetry: true,
    canSwitchLibrary: true,
  };
}

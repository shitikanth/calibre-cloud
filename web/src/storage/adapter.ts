export type LibraryPath = string;

export type FileStat = { size: number; version: string };

export type ReadOptions = {
  signal?: AbortSignal;
  onProgress?: (loaded: number, total: number) => void;
};

export interface StorageAdapter {
  stat(path: LibraryPath): Promise<FileStat>;
  read(path: LibraryPath, options?: ReadOptions): Promise<Blob>;
}

export class NotFound extends Error {
  override name = 'NotFound' as const;
}

export class ReconnectRequired extends Error {
  override name = 'ReconnectRequired' as const;
}

export class QuotaExceeded extends Error {
  override name = 'QuotaExceeded' as const;
  readonly retryAfter: number | undefined;

  constructor(message?: string, retryAfter?: number) {
    super(message);
    this.retryAfter = retryAfter;
  }
}

export class Network extends Error {
  override name = 'Network' as const;
}

export class Aborted extends Error {
  override name = 'Aborted' as const;
}

export type StorageError = NotFound | ReconnectRequired | QuotaExceeded | Network | Aborted;

export function isStorageError(error: unknown): error is StorageError {
  return (
    error instanceof NotFound ||
    error instanceof ReconnectRequired ||
    error instanceof QuotaExceeded ||
    error instanceof Network ||
    error instanceof Aborted
  );
}

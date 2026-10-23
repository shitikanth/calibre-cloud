export class LibraryIndexError extends Error {}

export class LibraryInUse extends LibraryIndexError {
  override name = 'LibraryInUse' as const;
}

export function libraryIndexError({ name, message }: { name: string; message: string }): LibraryIndexError {
  return name === 'LibraryInUse' ? new LibraryInUse(message) : new LibraryIndexError(message);
}

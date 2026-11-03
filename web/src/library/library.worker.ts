import { createDbStore, libraryDirectory } from './db-store.ts';
import { createLibraryHandler } from './handlers.ts';
import { workerNames, type LibraryRequest } from './protocol.ts';

const handle = createLibraryHandler(createDbStore(self.name === workerNames.inMemory ? () => Promise.resolve(undefined) : libraryDirectory));

let queue = Promise.resolve();

self.onmessage = ({ data: request }: MessageEvent<LibraryRequest>) => {
  queue = queue.then(async () => self.postMessage(await handle(request)));
};

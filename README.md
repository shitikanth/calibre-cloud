# calibre-cloud

Browse and read your [Calibre](https://calibre-ebook.com/) ebook library in a web browser, with nothing to install.

Point the app at the Calibre library folder (the one containing `metadata.db`) in your cloud storage, and start reading.

> **Status:** usable with Google Drive and MEGA. Dropbox is not built yet.
>
> Try it: <https://calibre-cloud.golu3990.workers.dev/>

## How it works

1. Open the web app and connect your cloud storage: sign in with Google and pick the folder that holds your library, or paste a MEGA shared folder link.
2. The app downloads `metadata.db` and opens it in the browser.
3. Browse and search your books by title, author, series, and tag, with their covers.
4. Open a book to read it in the browser (EPUB, KEPUB, PDF, MOBI, AZW3, FB2, CBZ, and more), or download any format. Book files and covers are fetched only when you need them.
5. Pick up where you left off: the app remembers your place in each book on this device.

Your library and book files go straight from your storage provider to your browser. calibre-cloud never stores or relays them.

## Storage providers

- Google Drive
- MEGA
- Dropbox (planned)

## Principles

- **Zero install:** a web app. You don't need Calibre, a Calibre content server, or a desktop client running anywhere.
- **Your data stays yours:** library metadata and book files never pass through a server we run. A small serverless backend handles only what a browser can't, such as finishing a sign-in, and stores nothing.
- **Costs scale to zero:** nothing runs while nobody is using the app, and running it shouldn't cost more as more people use it. Users' own storage accounts carry the bandwidth and storage.
- **Read-only:** the app never changes your library. Calibre on the desktop stays the source of truth.

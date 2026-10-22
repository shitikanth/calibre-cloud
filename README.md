# calibre-cloud

Browse and read your [Calibre](https://calibre-ebook.com/) ebook library in a web browser, with nothing to install.

Point the app at the Calibre library folder (the one containing `metadata.db`) in your cloud storage, and start reading.

> **Status:** early planning. Nothing is implemented yet.

## How it works

1. Open the web app and connect your cloud storage: sign in to Google Drive or Dropbox, or paste a MEGA shared folder link.
2. Pick your Calibre library folder.
3. The app downloads `metadata.db` and opens it in the browser.
4. Browse by author, series, tag, and so on, then open a book. Book files and covers are fetched only when you need them.

Your library and book files go straight from your storage provider to your browser. calibre-cloud never stores or relays them.

## Planned storage providers

- Google Drive
- Dropbox
- MEGA

## Principles

- **Zero install:** a web app. You don't need Calibre, a Calibre content server, or a desktop client running anywhere.
- **Your data stays yours:** library metadata and book files never pass through a server we run. A small serverless backend handles only what a browser can't, such as finishing a sign-in, and stores nothing.
- **Costs scale to zero:** nothing runs while nobody is using the app, and running it shouldn't cost more as more people use it. Users' own storage accounts carry the bandwidth and storage.
- **Read-only:** the app never changes your library. Calibre on the desktop stays the source of truth.

# calibre-cloud

A browser app for browsing and reading a Calibre library straight from the cloud storage it already lives in.

## Language

**Library**:
A Calibre library: a folder that holds `metadata.db` and the book files Calibre manages for it.
_Avoid_: collection, bookshelf

**Library root**:
The folder in the user's storage that directly contains a library's `metadata.db`.
_Avoid_: library folder, base path

**Library path**:
Where a file sits inside a library, relative to the library root and written the way Calibre records it.
_Avoid_: file path, absolute path

**Book**:
One title in a library, with its metadata and one or more formats.
_Avoid_: title, entry, item

**Format**:
One file of a book in a particular file type, such as EPUB or PDF.
_Avoid_: edition, copy, version

**Storage provider**:
A cloud storage service a library can live in: Dropbox, Google Drive, or MEGA.
_Avoid_: backend, cloud, drive

**Connection**:
The app's read-only access to one library in one storage provider. Ending it is a disconnect.
_Avoid_: session, account, login, sign-in

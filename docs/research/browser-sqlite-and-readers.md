# Research: in-browser SQLite engine and EPUB/PDF renderers

Question: which in-browser SQLite engine, EPUB renderer and PDF renderer fit the calibre-cloud MVP (`docs/hld.md`)?
Sources are primary only (official docs, READMEs, source, npm registry metadata). Checked 2026-10-22.

## Bottom line

| Slot | Pick | Main trade-off |
|---|---|---|
| SQLite | **Official SQLite WASM** (`@sqlite.org/sqlite-wasm`) | ~0.9 MB wasm, larger than sql.js. In return it is first-party, has a read-only deserialize flag, and has an OPFS persistence path that needs no COOP/COEP. |
| EPUB | **foliate-js** | Not stable, with no tagged release; the author recommends vendoring it as a git submodule. It is the only candidate that takes a `Blob` directly, reads the zip lazily, and documents its security model. |
| PDF | **pdf.js** (`pdfjs-dist`) | Safari is supported only by the `legacy` build ("Mostly"). The worker is ~1.3 MB minified. |

Deployment constraints for the MVP:
- **No COOP/COEP needed** if we use in-memory `sqlite3_deserialize` or the `opfs-sahpool` VFS. Only the plain `opfs` VFS needs them. Avoid it, because COEP `require-corp` would also constrain cross-origin cover images.
- **Workers**: the pdf.js worker (`GlobalWorkerOptions.workerSrc` must be set). A SQLite worker is needed only if we persist with OPFS.
- **CSP is mandatory, not optional**: `script-src 'self' 'wasm-unsafe-eval'` [28], with no `unsafe-inline` and no `blob:` scripts. No EPUB renderer can safely sandbox book scripts, and both SQLite and pdf.js load WASM.

## 1. SQLite in the browser

| | Official SQLite WASM | sql.js | wa-sqlite |
|---|---|---|---|
| License | SQLite public domain; npm wrapper Apache-2.0 [5] | MIT (SQLite PD) [6] | MIT since 2023-02-10 [8] |
| Maintainer / status | SQLite project. "first effort 'officially' associated with the SQLite project" [3]. npm `3.54.1-build1`, 2026-10-19 [11] | Community. v1.15.1, 2026-10-19, SQLite 3.54.0 [7] | One maintainer. GitHub v1.1.2, 2026-08-11 [9]. npm `wa-sqlite` stuck at 1.0.0 (Jan 2024) [11] |
| Size (uncompressed) | `sqlite3.wasm` 879 KB + `sqlite3.mjs` 827 KB unminified [12] | single-file inline build 960 KB; wasm+js zip 353 KB [7] | sync `wa-sqlite.wasm` 611 KB + 123 KB mjs; Asyncify build 1.26 MB [10] |
| Open from bytes | `sqlite3_deserialize()` after `wasm.allocFromTypedArray(buf)` [2]. `SQLITE_DESERIALIZE_READONLY` stops the db growing [4]. `opfs-sahpool` `importDb(name, bytes)` [1] | `new SQL.Database(uint8array)` [6] | No deserialize wrapper in `sqlite-api.js` [10]. You write the file into a VFS (e.g. OPFS) and open it by name |
| Read-only | READONLY deserialize flag, or `PRAGMA query_only` | `PRAGMA query_only` (no documented read-only open) | VFS-level |
| Persistence | `opfs`: Worker **and COOP/COEP**. `opfs-sahpool`: Worker only, **no COOP/COEP**, since 3.43. `kvvfs`: main thread, localStorage [1] | None. Export with `db.export()` and store it yourself [6] | IndexedDB and OPFS VFSes. All marked "No COOP/COEP requirements". OPFS ones are mostly Worker-only [10] |
| Memory | Deserialized db lives in the WASM heap. With an OPFS VFS, pages are read from the file | "virtual database file stored in memory". Whole db in RAM [6] | Depends on VFS |

Notes:
- The main build runs on the UI thread for in-memory DBs with no special headers. Worker1/Promiser is optional [13].
- Tens of MB in memory is within reach for all three. Expect a transient ~2x peak while bytes are copied into the WASM heap (inference from the alloc+deserialize API, not measured).
- wa-sqlite's VFSes are presented as "examples" [10]. Its flexibility (Asyncify/JSPI, custom JS VFS) is not needed for a read-only db.
- **Calibre-specific (affects any engine):** the stock schema's views (`meta`, `tag_browser_*`) call Calibre's Python-registered functions `sortconcat`, `concat` and `books_list_filter` [14]. Query base tables, or register JS UDFs (all three engines support user functions).
- Caching `metadata.db` (hld risk 3) without a worker: store the raw bytes in IndexedDB/OPFS and deserialize on each visit. With a worker: `opfs-sahpool` `importDb`, then open in place.

## 2. EPUB rendering

| | foliate-js | epub.js | Readium ts-toolkit (`@readium/navigator`) |
|---|---|---|---|
| License | MIT. Vendors zip.js (BSD-3) and fflate (MIT) [15] | BSD-2-Clause [11][17] | BSD-3-Clause [11] |
| Status | Active (commits to 2026-05). Repo: "This library itself is, however, *not* stable… there's no release yet", so use it as a git submodule [15] | Last npm release 0.3.93 on 2022-02-16. 0.5.0-alpha.3 in 2023. Last commit 2026-03, 517 open issues [11][16] | Very active (npm 2.13.2, 2026-10-19). Small adoption (158 stars) [11][16] |
| Input | `view.open(File \| Blob \| URL)`. "Does not require loading whole file into memory". zip.js gives random access [15] | `ePub(url \| ArrayBuffer)`. Needs JSZip, which takes the whole archive [17][18] | A Readium Web Publication Manifest plus a `Fetcher`. Only `HttpFetcher` ships, and a positions list is required [19][20] |
| Layout | Paginated (CSS multi-column) and scrolled, switchable without reload. Fixed-layout renderer [15] | `paginated`, `scrolled-doc`, continuous [17] | Reflow + FXL, preferences API [20] |
| TOC | `book.toc` (+ `pageList`) [15] | `book.navigation.toc` [18] | From the manifest |
| Position | EPUB CFI (`epubcfi.js`). `relocate` event gives range/fraction; `goTo(cfi)` [15] | CFI via `rendition.currentLocation()` / `display(cfi)` [18] | Readium `Locator` (`currentLocator`) [20] |
| Untrusted HTML/JS | Scripted content unsupported. "impossible… securely" with same-origin `blob:` URLs. WebKit bug 218086 forces `allow-scripts`, so "iframe sandbox useless". **Requires CSP** [15] | iframe `sandbox="allow-same-origin"`. `allowScriptedContent: true` "makes the sandbox insecure" [17][21] | iframe `sandbox="allow-same-origin allow-scripts"` [22]. Per MDN, for same-origin content that combination "lets the embedded document remove the `sandbox` attribute" [23] |
| Size | 376 KB unpacked, unbundled ES modules [11] | `epub.min.js` 224 KB + JSZip [12] | navigator 1.5 MB unpacked [11] |

Verdict:
- **foliate-js fits best.** It takes a `Blob`, so MEGA-decrypted bytes go straight in with no URL needed. It reads the zip lazily, has CFI positions, TOC and both flows, and is battle-tested in the Foliate desktop app. It also reads MOBI/AZW3/FB2/CBZ, which is relevant to hld risk 4.
- epub.js: the release line has been frozen since 2022.
- Readium Web: aimed at streamed WebPubs. Using it would mean writing an in-browser EPUB-to-manifest-and-positions generator. Generating them on a server would push book bytes through our backend, which breaks "costs scale to zero".

## 3. PDF rendering

- **pdf.js** (Mozilla), Apache-2.0. v6.4.299 was released 2026-10-03 [11][24].
- `getDocument({ data })` accepts a TypedArray or ArrayBuffer. TypedArrays "will generally be transferred to the worker-thread", so the caller loses them [25].
- `getDocument({ url })` streams and uses HTTP Range requests when the server supports them. The default chunk is 64 KiB, and `disableRange`/`disableStream` turn this off. `range: PDFDataRangeTransport` lets us plug in our own range source, for example via the storage adapter [25][26]. Cross-origin URLs need CORS, including the exposed range headers [26].
- Worker: set `GlobalWorkerOptions.workerSrc` ("should always be set"), or `workerPort` [27]. The `pdf.js` and `pdf.worker.js` versions must match exactly [26]. It uses WASM for image decoding by default (`useWasm: true`, `wasmUrl`) [25].
- Size (minified, uncompressed): `pdf.min.mjs` 459 KB + `pdf.worker.min.mjs` 1.26 MB. The legacy build is 524 KB + 1.32 MB [12].
- Browsers: the modern build targets latest Firefox and Chrome only. The **legacy build** covers Safari 18+ ("Mostly"), Chrome 125+, Edge and Firefox ESR [26]. Ship legacy if iOS/Safari matters.
- Alternative: foliate-js's pdf.js adapter is "proof-of-concept, highly experimental" [15]. No other credible open-source in-browser PDF renderer was investigated.
- MVP: load from bytes (`data`), since the storage adapter reads whole files. Range loading is a later optimisation and depends on each provider's CORS/Range support (unverified).

## Unverified / follow-ups

- Real memory use and open time for a tens-of-MB `metadata.db` in each engine (not measured).
- Whether Dropbox, Drive and MEGA download endpoints allow CORS Range requests, which pdf.js range loading would need.
- foliate-js behaviour under our exact CSP in Safari/WebKit (README targets WebKitGTK, Firefox and Chromium [15]).
- The npm package `foliate-js@1.0.1` (2025-04) exists and points at the official repo, but the README still says "no release yet".

## Sources

1. https://sqlite.org/wasm/doc/trunk/persistence.md
2. https://sqlite.org/wasm/doc/trunk/cookbook.md
3. https://sqlite.org/wasm/doc/trunk/about.md
4. https://sqlite.org/c3ref/deserialize.html
5. https://github.com/sqlite/sqlite-wasm
6. https://github.com/sql-js/sql.js
7. https://github.com/sql-js/sql.js/releases/tag/v1.15.1 , https://github.com/sql-js/sql.js/releases/tag/v1.15.0
8. https://github.com/rhashimoto/wa-sqlite
9. https://github.com/rhashimoto/wa-sqlite/releases
10. https://github.com/rhashimoto/wa-sqlite/tree/master/src/examples#vfs-comparison , https://github.com/rhashimoto/wa-sqlite/tree/master/dist , https://github.com/rhashimoto/wa-sqlite/blob/master/src/sqlite-api.js
11. npm registry (`npm view <pkg>`): @sqlite.org/sqlite-wasm, sql.js, wa-sqlite, foliate-js, epubjs, @readium/navigator, pdfjs-dist
12. jsDelivr file listings: https://data.jsdelivr.com/v1/packages/npm/pdfjs-dist@6.4.299 , .../epubjs@0.3.93 , .../@sqlite.org/sqlite-wasm@3.54.1-build1 (and https://github.com/sqlite/sqlite-wasm/tree/main/src/bin)
13. https://sqlite.org/wasm/doc/trunk/api-index.md
14. https://github.com/kovidgoyal/calibre/blob/master/resources/metadata_sqlite.sql
15. https://github.com/johnfactotum/foliate-js (README)
16. https://github.com/futurepress/epub.js/commits/master , https://github.com/readium/ts-toolkit
17. https://github.com/futurepress/epub.js (README)
18. https://github.com/futurepress/epub.js/blob/master/documentation/md/API.md
19. https://github.com/readium/ts-toolkit/blob/develop/navigator/docs/HandlingPublications.md
20. https://github.com/readium/ts-toolkit/blob/develop/navigator/docs/epub/EpubNavigator.md , https://github.com/readium/ts-toolkit/tree/develop/shared/src/fetcher
21. https://github.com/futurepress/epub.js/blob/master/src/managers/views/iframe.js
22. https://github.com/readium/ts-toolkit/blob/develop/navigator/src/epub/frame/FrameManager.ts
23. https://developer.mozilla.org/en-US/docs/Web/HTML/Element/iframe#sandbox
24. https://github.com/mozilla/pdf.js/releases/tag/v6.4.299
25. https://github.com/mozilla/pdf.js/blob/master/src/display/api.js (DocumentInitParameters) , https://mozilla.github.io/pdf.js/api/draft/module-pdfjsLib.html
26. https://github.com/mozilla/pdf.js/wiki/Frequently-Asked-Questions
27. https://github.com/mozilla/pdf.js/blob/master/src/display/worker_options.js
28. https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/script-src

# calibre-web: ideas worth borrowing

Research for the wayfinder ticket "calibre-web: ideas worth borrowing". We borrow ideas, not code.
Sources are calibre-web at [`6e840ac`][cw] (master, 2026-10) and Calibre's schema file
[`metadata_sqlite.sql` @ `1c1b407`][cal]. Line links are pinned to those commits.

License, for the record: calibre-web is GPL-3.0 ([LICENSE][cw-lic], [README][cw-readme]). Since we copy no code, it doesn't constrain us.

## 1. How calibre-web reads `metadata.db`

**Approach.** The whole schema is a hand-written SQLAlchemy model in [`cps/db.py`][db]. It queries only
base tables and `books_*_link` join tables. It never uses Calibre's views: nothing under `cps/` references
`meta` or `tag_browser_*`.

| Entity | Tables used | Notes |
|---|---|---|
| Books | `books` ([L403][db-books]) | `sort`, `author_sort`, `series_index`, `path`, `has_cover`, `timestamp`, `pubdate`, `last_modified`, `uuid` |
| Authors, tags, series, publishers, ratings, languages | `authors`, `tags`, `series`, `publishers`, `ratings`, `languages`, each joined through `books_<x>_link` ([L61-89][db-links]) | Link column names vary: `author`, `tag`, `series`, `publisher`, `rating`, `lang_code` (FK to `languages.id`) |
| Formats | `data` ([L368][db-data]): `book`, `format`, `name`, `uncompressed_size` | File = `{books.path}/{data.name}.{lower(format)}` ([helper.py L921-L960][dl]) |
| Covers | `books.has_cover` + `{books.path}/cover.jpg` ([helper.py L740-L775][cover]) | Falls back to a generic image |
| Description, identifiers | `comments.text`, `identifiers(type,val)` | Identifier types map to links like ISBN→WorldCat, DOI, Goodreads ([db.py `Identifiers.__repr__`][db]) |
| Custom columns | `custom_columns(id,label,name,datatype,is_multiple,display)`, then `custom_column_N` ([setup_db_cc_classes L567][db-cc]) | See below |

**Custom columns** ([L567-L660][db-cc]). At connect time it runs `SELECT id, datatype FROM custom_columns`
([L717][db-ccsel]) and builds one class per column:
- `text`, `enumeration`, `rating`: values in `custom_column_N`, joined via `books_custom_column_N_link(book, value)`.
- `int`, `float`, `bool`, `datetime`, `comments`: `custom_column_N(book, value)` keyed by book directly.
- `composite` and `series` are skipped (`cc_exceptions`, [L56][db-exc]). Composites are computed by Calibre's template engine and aren't stored.

**Calibre's custom SQL functions.** Calibre's schema calls functions that only exist inside Calibre:
- `title_sort()` and `uuid4()` run in the `books_insert_trg` / `books_update_trg` triggers ([cal L381-L390][cal-trg]).
- `sortconcat`, `concat`, `books_list_filter` and `title_sort` are used in the `meta` and `tag_browser_*` views ([cal L210-L330][cal-views]).

calibre-web registers stand-ins in [`create_functions`][db-fn] (L1144-L1170):
- `title_sort`: a regex that moves leading articles to the end.
- `uuid4`.
- An override of `lower()` with `unidecode(s.lower())` ([L1176][db-lcase]), so `LIKE` search ignores accents and case beyond ASCII.

It registers these lazily, before writes (editbooks) and before search or typeahead, not when it opens the
database. It opens with `ATTACH '<path>/metadata.db' AS calibre` on an in-memory engine, alongside its own
app DB, plus `PRAGMA cache_size` ([L703-L705][db-attach]).

**What ports to in-browser SQLite:**
- Read-only `SELECT`s on base and link tables need **no** Calibre functions, because triggers only fire on writes. Avoid the views, as calibre-web does, and the function problem disappears.
- Port directly:
  - The join shapes above.
  - Per-entity counts: `GROUP BY` on the link table ([author list][web-author]).
  - A–Z jump lists: `GROUP BY upper(substr(sort,1,1))` ([query_char_list][web-char]).
  - "None" buckets: an outer join where the link is null ([series_list][web-series]).
  - Sort keys: `books.sort`, `author_sort`, `pubdate`, `timestamp`, then `series.name, series_index` ([get_sort_function][web-sort]).
- Search ([search_query L972-L1060][db-search]):
  - First it checks for a `books_fts` table and uses FTS5 `MATCH`.
  - Otherwise it builds an `OR` of `LIKE '%term%'` subqueries across title, tags, series, publishers, authors (split on spaces/commas) and text custom columns.
  - The `LIKE` fallback ports as-is. Accent folding needs our own `lower()`, if the engine we pick can register functions (unverified, HLD open question 5).
- Author order: `books_authors_link` has no position column, so calibre-web reorders a book's authors by splitting `books.author_sort` on `&` ([order_authors L908][db-order]). Worth copying as an idea.
- Language names: calibre-web maps ISO codes with pycountry/iso639 ([isoLanguages.py][iso]). In a browser, a built-in or a small table does the job.
- Ratings are stored 0–10 (half-stars doubled; CHECK constraint in [Ratings][db]). "Top rated" is `rating > 9` ([render_rated_books][web-rated]).

## 2. Feature set: what fits a read-only, client-side viewer

From the [README feature list][cw-readme], [sidebar flags][const] and [web.py routes][web].

| Feature | Fit | Why |
|---|---|---|
| Browse by author, series, tag ("category"), publisher, language, rating, file format | **Client** | Pure `metadata.db` queries |
| Recently added, sort options (title, author, pubdate, added, series index) | **Client** | `ORDER BY` only |
| Discover (random books), Top rated | **Client** | `ORDER BY random()`, `rating > 9` |
| Simple search, advanced search (include/exclude tags, series, languages, formats; pubdate and rating ranges; custom-column filters) ([search.py][search]) | **Client** | Shelf include/exclude and read-status filters need user state (below) |
| Book detail page: formats, identifiers, series position, custom columns, sanitized description ([detail.html][detail], [clean_html.py][clean]) | **Client** | Descriptions are HTML from the library, so sanitize them as calibre-web does |
| Table/list view of all books ([books_table][web-table]) | **Client** (read-only) | calibre-web's table also edits; we wouldn't |
| In-browser readers (EPUB, PDF, comics, TXT, DjVu, audio) | **Client** | See §4 |
| Download a format | **Client** | Straight from the provider |
| Read/unread | **Client, partial** | calibre-web reads a Calibre bool custom column *or* its own DB. We can read the column; marking read would need local storage |
| Reading position, bookmarks | **Client (local)** | calibre-web stores them server-side; its EPUB reader also autosaves to `localStorage` (commit `bba7812`) |
| Shelves, archive | Local-only at most | Stored in calibre-web's app DB, not Calibre's |
| "Hot" books / download stats | **Server** | Counts downloads per user |
| User accounts, permissions, per-user tag/column restrictions ([common_filters][db-filters]), LDAP/OAuth, magic link | **Server** | Multi-user auth |
| Upload, metadata edit/delete, metadata download, conversion (Calibre binaries), Kobo sync, send to e-reader, OPDS feed, self-update | **Server / writes** | Break read-only or need a long-running service |
| Server-generated cover thumbnails ([schedule.py][sched]) | **Server** | We fetch `cover.jpg` lazily instead (HLD main flow) |

## 3. UX and navigation ideas

- **Sidebar of browse entry points**, each toggleable per user ([constants.py L83-L100][const]): Books (recent), Discover, Top rated, Categories, Series, Authors, Publishers, Languages, Ratings, File formats, Books list. A good MVP nav.
- **Entity list pages** show name plus book count, have an A–Z letter strip from `query_char_list`, and an asc/desc toggle ([author_list][web-author], [list.html][list]).
- **Series as a cover grid**, one cover per series, with a list/grid toggle ([series_list][web-series]).
- **"None" pseudo-entries** for books with no series or language, so nothing is unreachable ([series_list][web-series], [speaking_language][db-lang]).
- **Sticky sort per view**: the last sort is remembered for each list (`set_view_property('stored')` in [get_sort_function][web-sort]). This maps to `localStorage`.
- **Detail-page links**: identifiers become external links; series shows "Book N of <series>" linking to the series list ([detail.html L158][detail-series]).
- **Reader per format**: a "Read in browser" button for each readable format on the detail page ([detail.html][detail]).

## 4. Readers: which libraries, and how they're wired

calibre-web routes by format in [`read_book`][web-read] (L1570-L1626) to one template per reader. Every reader loads the book from a **URL**: the `/show/<id>/<format>` endpoint ([serve_book][web-show]), which streams the file and supports Range requests for PDF.

| Format | Library (as bundled) | Upstream license | Wiring |
|---|---|---|---|
| EPUB, KEPUB | epub.js 0.3.93 (`epub.min.js`, commit `39638d3`) + epubjs-reader UI (`reader.min.js`) + JSZip 3.10.1 | BSD-2 ([epub.js][epubjs-lic]); MIT (epubjs-reader); MIT/GPLv3 dual (JSZip) | `ePubReader(bookUrl, {restore:true})` ([epub.js][rd-epub], [read.html L142-L150][rd-epub-t]); themes and font settings in `localStorage` |
| PDF | Mozilla pdf.js 4.5.136, full `viewer.html` app | Apache-2.0 ([header][pdfjs]) | `PDFViewerApplicationOptions.set('defaultUrl', …)` plus `workerSrc` and `cMapUrl` ([readpdf.html L38-L54][rd-pdf]) |
| CBZ, CBR, CBT | kthoom (comic viewer) + uncompress.js (zip via JSZip, tar, RAR via libunrar emscripten) | MIT (kthoom, uncompress.js); UnRAR is "freeware" ([libunrar.js header][unrar]) | `init(url)` does an XHR with `responseType="arraybuffer"`, then `loadFromArrayBuffer` ([kthoom.js L662-L670][kthoom]); unpacking happens in the browser |
| TXT | own `txt_reader.js` | (calibre-web) | Server sniffs the encoding with chardet ([serve_book][web-show]) |
| DjVu | djvu_html5 (GWT build) | not stated in repo | `<div id="djvuContainer" file="url">` ([readdjvu.html][rd-djvu]) |
| MP3 etc. | SoundManager2 / bar-ui | (not checked) | `listenmp3.html` |

**Why these libraries?** The commits don't give reasons. History shows epub.js and pdf.js since 2016 (`9a8d795`),
kthoom added for comic issues #63 and #126 (`fe4d11f`), and a 2023 switch to the single `epub.min.js` bundle
(`d055127`). Our inference: they are the standard open-source in-browser renderers for each format, so the
server only serves bytes. That matches our client-first model.

**Relevance for us (inference, not tested):**
- The readers take a URL, except kthoom, which already works off an `ArrayBuffer`. Our storage adapter must hand each reader a URL (for example a `blob:` URL of downloaded bytes, or a provider temporary link) or bytes.
- Comic unpacking (zip, tar) is already client-side in calibre-web. CBR needs the UnRAR port and its non-OSI license; consider deferring CBR.

## 5. Bottom line

**Borrow (ideas):**
1. Query base and link tables only, never Calibre's views. Read-only use then needs no Calibre SQL functions ([db.py][db], [cal views][cal-views]).
2. Read custom columns dynamically from `custom_columns` and branch on `datatype` for the link-table vs direct-FK layout; skip `composite` ([L567][db-cc]).
3. Find files by convention: `{path}/{data.name}.{format}` and `{path}/cover.jpg` ([helper.py][dl]).
4. Order authors by `author_sort`; sort lists on the `sort` columns ([L908][db-order]).
5. Search as an `OR` of `LIKE` across title, authors, tags, series, publisher, with optional accent-folding `lower()` ([L972][db-search], [L1176][db-lcase]).
6. Navigation: browse sidebar, entity lists with counts and an A–Z strip, series cover grid, "None" buckets, per-view sticky sort ([web.py][web]).
7. Reader stack: epub.js, pdf.js and a kthoom-style comic viewer, all client-side, with reader prefs and position in `localStorage`.
8. Drive adapter: cache path→folder-ID lookups, resolving folder by folder ([gdriveutils.py getFolderId L277][gd-path]). Refresh `metadata.db` when the provider's checksum changes ([gdrive.py L141-L153][gd-watch]).

**Avoid:**
- calibre-web's server-only features (§2 table).
- Server-side thumbnails and TXT encoding sniffing.
- The `books_fts` FTS5 path: calibre-web treats it as optional, and we haven't confirmed whether Calibre creates it in `metadata.db`.
- Its Drive change check: it hashes the path string, not the file ([gdrive.py L143][gd-watch]).

**Unverified:**
- The upstream license and provenance of djvu_html5.
- Whether our SQLite engine supports user-defined functions.
- How each reader library accepts `blob:` URLs or ArrayBuffers (check their docs when choosing).

[cw]: https://github.com/janeczku/calibre-web/tree/6e840acbda8d62fdd159bf3855c01872d629a914
[cw-lic]: https://github.com/janeczku/calibre-web/blob/6e840acbda8d62fdd159bf3855c01872d629a914/LICENSE
[cw-readme]: https://github.com/janeczku/calibre-web/blob/6e840acbda8d62fdd159bf3855c01872d629a914/README.md#features
[cal]: https://github.com/kovidgoyal/calibre/blob/1c1b407d76e23d4a1294d61bf73d915f247e3b83/resources/metadata_sqlite.sql
[cal-trg]: https://github.com/kovidgoyal/calibre/blob/1c1b407d76e23d4a1294d61bf73d915f247e3b83/resources/metadata_sqlite.sql#L381-L390
[cal-views]: https://github.com/kovidgoyal/calibre/blob/1c1b407d76e23d4a1294d61bf73d915f247e3b83/resources/metadata_sqlite.sql#L210-L330
[db]: https://github.com/janeczku/calibre-web/blob/6e840acbda8d62fdd159bf3855c01872d629a914/cps/db.py
[db-exc]: https://github.com/janeczku/calibre-web/blob/6e840acbda8d62fdd159bf3855c01872d629a914/cps/db.py#L56
[db-links]: https://github.com/janeczku/calibre-web/blob/6e840acbda8d62fdd159bf3855c01872d629a914/cps/db.py#L61-L89
[db-data]: https://github.com/janeczku/calibre-web/blob/6e840acbda8d62fdd159bf3855c01872d629a914/cps/db.py#L368
[db-books]: https://github.com/janeczku/calibre-web/blob/6e840acbda8d62fdd159bf3855c01872d629a914/cps/db.py#L403-L460
[db-cc]: https://github.com/janeczku/calibre-web/blob/6e840acbda8d62fdd159bf3855c01872d629a914/cps/db.py#L567-L660
[db-attach]: https://github.com/janeczku/calibre-web/blob/6e840acbda8d62fdd159bf3855c01872d629a914/cps/db.py#L703-L705
[db-ccsel]: https://github.com/janeczku/calibre-web/blob/6e840acbda8d62fdd159bf3855c01872d629a914/cps/db.py#L717
[db-filters]: https://github.com/janeczku/calibre-web/blob/6e840acbda8d62fdd159bf3855c01872d629a914/cps/db.py#L775
[db-order]: https://github.com/janeczku/calibre-web/blob/6e840acbda8d62fdd159bf3855c01872d629a914/cps/db.py#L908-L947
[db-search]: https://github.com/janeczku/calibre-web/blob/6e840acbda8d62fdd159bf3855c01872d629a914/cps/db.py#L972-L1060
[db-lang]: https://github.com/janeczku/calibre-web/blob/6e840acbda8d62fdd159bf3855c01872d629a914/cps/db.py#L1111
[db-fn]: https://github.com/janeczku/calibre-web/blob/6e840acbda8d62fdd159bf3855c01872d629a914/cps/db.py#L1144-L1170
[db-lcase]: https://github.com/janeczku/calibre-web/blob/6e840acbda8d62fdd159bf3855c01872d629a914/cps/db.py#L1176
[web]: https://github.com/janeczku/calibre-web/blob/6e840acbda8d62fdd159bf3855c01872d629a914/cps/web.py
[web-char]: https://github.com/janeczku/calibre-web/blob/6e840acbda8d62fdd159bf3855c01872d629a914/cps/web.py#L335-L339
[web-sort]: https://github.com/janeczku/calibre-web/blob/6e840acbda8d62fdd159bf3855c01872d629a914/cps/web.py#L342-L374
[web-rated]: https://github.com/janeczku/calibre-web/blob/6e840acbda8d62fdd159bf3855c01872d629a914/cps/web.py#L426
[web-table]: https://github.com/janeczku/calibre-web/blob/6e840acbda8d62fdd159bf3855c01872d629a914/cps/web.py#L830
[web-author]: https://github.com/janeczku/calibre-web/blob/6e840acbda8d62fdd159bf3855c01872d629a914/cps/web.py#L935-L957
[web-series]: https://github.com/janeczku/calibre-web/blob/6e840acbda8d62fdd159bf3855c01872d629a914/cps/web.py#L1009-L1053
[web-show]: https://github.com/janeczku/calibre-web/blob/6e840acbda8d62fdd159bf3855c01872d629a914/cps/web.py#L1194-L1244
[web-read]: https://github.com/janeczku/calibre-web/blob/6e840acbda8d62fdd159bf3855c01872d629a914/cps/web.py#L1570-L1626
[const]: https://github.com/janeczku/calibre-web/blob/6e840acbda8d62fdd159bf3855c01872d629a914/cps/constants.py#L83-L100
[search]: https://github.com/janeczku/calibre-web/blob/6e840acbda8d62fdd159bf3855c01872d629a914/cps/search.py
[iso]: https://github.com/janeczku/calibre-web/blob/6e840acbda8d62fdd159bf3855c01872d629a914/cps/isoLanguages.py
[sched]: https://github.com/janeczku/calibre-web/blob/6e840acbda8d62fdd159bf3855c01872d629a914/cps/schedule.py
[clean]: https://github.com/janeczku/calibre-web/blob/6e840acbda8d62fdd159bf3855c01872d629a914/cps/clean_html.py
[dl]: https://github.com/janeczku/calibre-web/blob/6e840acbda8d62fdd159bf3855c01872d629a914/cps/helper.py#L921-L960
[cover]: https://github.com/janeczku/calibre-web/blob/6e840acbda8d62fdd159bf3855c01872d629a914/cps/helper.py#L740-L775
[gd-path]: https://github.com/janeczku/calibre-web/blob/6e840acbda8d62fdd159bf3855c01872d629a914/cps/gdriveutils.py#L277-L312
[gd-watch]: https://github.com/janeczku/calibre-web/blob/6e840acbda8d62fdd159bf3855c01872d629a914/cps/gdrive.py#L141-L153
[detail]: https://github.com/janeczku/calibre-web/blob/6e840acbda8d62fdd159bf3855c01872d629a914/cps/themes/standard/templates/detail.html
[detail-series]: https://github.com/janeczku/calibre-web/blob/6e840acbda8d62fdd159bf3855c01872d629a914/cps/themes/standard/templates/detail.html#L158
[list]: https://github.com/janeczku/calibre-web/blob/6e840acbda8d62fdd159bf3855c01872d629a914/cps/themes/standard/templates/list.html
[rd-epub]: https://github.com/janeczku/calibre-web/blob/6e840acbda8d62fdd159bf3855c01872d629a914/cps/static/js/reading/epub.js#L11-L14
[rd-epub-t]: https://github.com/janeczku/calibre-web/blob/6e840acbda8d62fdd159bf3855c01872d629a914/cps/themes/standard/templates/read.html#L142-L150
[rd-pdf]: https://github.com/janeczku/calibre-web/blob/6e840acbda8d62fdd159bf3855c01872d629a914/cps/themes/standard/templates/readpdf.html#L38-L54
[rd-djvu]: https://github.com/janeczku/calibre-web/blob/6e840acbda8d62fdd159bf3855c01872d629a914/cps/themes/standard/templates/readdjvu.html#L17-L21
[pdfjs]: https://github.com/janeczku/calibre-web/blob/6e840acbda8d62fdd159bf3855c01872d629a914/cps/static/js/libs/pdf.js#L1-L21
[kthoom]: https://github.com/janeczku/calibre-web/blob/6e840acbda8d62fdd159bf3855c01872d629a914/cps/static/js/kthoom.js#L662-L670
[unrar]: https://github.com/janeczku/calibre-web/blob/6e840acbda8d62fdd159bf3855c01872d629a914/cps/static/js/compress/libunrar.js#L1-L12
[epubjs-lic]: https://github.com/futurepress/epub.js/blob/master/license

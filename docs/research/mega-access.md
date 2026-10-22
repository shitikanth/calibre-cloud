# Research: reading a Calibre library from MEGA in the browser

Question: how can calibre-cloud read a Calibre library stored in MEGA entirely from the browser, and what limits apply?
Researched 2026-10-22. Facts come from primary sources, linked below. Statements marked **observed** come from a live `curl` against MEGA's hosts on that date. They are not documented guarantees.

## Bottom line

- **Use a shared folder link as the MVP access mode**, as `docs/hld.md` already plans. A browser can list the whole tree, resolve relative paths, and download and decrypt byte ranges without any proxy. It is read-only by construction, and the app never touches the user's password.
- **Nothing here forces a server, a proxy, or a recurring cost on us.** MEGA's API and storage hosts send `Access-Control-Allow-Origin: *`, and transfer quota is charged per downloader IP or per account, never to us.
- **Unresolved non-technical risk:** MEGA's Terms require registration and approval before publishing an app that uses the API (see Licensing and ToS). Email `api@mega.io` before a public launch.
- **A small prototype is still worth doing**, but only for performance and edge cases. Feasibility is settled. See the last section for what it must test.

## 1. Access modes

### (a) Shared folder link: `https://mega.nz/folder/<handle>#<key>`

- **Key handling:** the key sits in the URL fragment, which browsers never send to a server. The client fetches metadata and decrypts it locally ([help: encrypted links](https://help.mega.io/security/data-protection/encrypted-links)).
- **List the tree:** one API call (`a:'f', c:1, ca:1, r:1`, with `n=<folder handle>` in the query string) returns every node under the link. The client then decrypts the names ([megajs `lib/file.mjs` `loadAttributes`](https://github.com/qgustavor/mega/blob/next/lib/file.mjs)). The API docs describe `n` as "the node token of the filesystem tree authentication mode" ([mega.io/developers, Request URL format](https://mega.io/developers)).
- **Look up by path:** resolved in memory over the loaded tree. megajs provides `folder.navigate('some folder/test.txt')` ([megajs API docs](https://github.com/qgustavor/megajs-docs/blob/main/docs/api.md)). This fits the storage adapter's "read a file by relative path" contract.
- **Download and decrypt:** a `g` request returns a temporary storage URL. The client fetches ciphertext and decrypts AES-128-CTR locally ([mega.io/developers, Cryptography](https://mega.io/developers)).
- **Read-only:** the SDK docs say "exported folders cannot be written to" ([mega.io/developers, megaclient `login`](https://mega.io/developers)). That matches our read-only principle without any extra work.
- **Security implications:**
  - Anyone holding the full link can read the whole library ([help: encrypted links](https://help.mega.io/security/data-protection/encrypted-links), "A word of caution").
  - Revocation is easy. Removing the link, or moving the folder to the Rubbish bin, kills it, and a re-created link is completely different ([help: remove a link](https://help.mega.io/files-folders/sharing/disable-link)).
  - Expiry dates and link passwords exist, but only on paid accounts ([help: make links more secure](https://help.mega.io/security/data-protection/make-links-more-secure)). megajs's URL parser does not recognise password-protected link formats ([`File.fromURL`](https://github.com/qgustavor/mega/blob/next/lib/file.mjs)).
  - Our app must keep the link in browser storage and never send it to our backend or analytics.

### (b) Account login (email + password + optional 2FA)

- **Feasible in a browser.** megajs's `Storage` accepts email, password and `secondFactorCode` ([megajs login tutorial](https://github.com/qgustavor/megajs-docs/blob/main/docs/tutorial/login.md)).
  - The browser build derives the key with WebCrypto PBKDF2 at 100,000 iterations ([`browser/aes.mjs`](https://github.com/qgustavor/mega/blob/next/browser/aes.mjs)).
  - The account master key is "encrypted with a hash derived from the user's login password" ([mega.io/developers, Cryptography](https://mega.io/developers)).
  - Sessions can be saved with `storage.toJSON()` and restored later ([login tutorial, "Resume a Session"](https://github.com/qgustavor/megajs-docs/blob/main/docs/tutorial/login.md)).
- **Capabilities:** listing, `navigate`/`find`, and download work as with links. However, login loads the account's entire node tree, not just the library (`a:'f', c:1` in [`lib/storage.mjs`](https://github.com/qgustavor/mega/blob/next/lib/storage.mjs)).
- **Security implications:**
  - Our page handles the raw password, and the resulting session has full read-write access to the whole account. There is no scoped or read-only token.
  - A persisted session in localStorage is a full-account credential.
  - The megajs author's own advice: "avoid using the `Storage` class in a web page if you want to be safe" ([megajs security doc](https://github.com/qgustavor/megajs-docs/blob/main/docs/tutorial/security.md)).
  - This conflicts with the read-only principle in spirit, and with the HLD's "use a shared folder link instead of the user's password".
- **The one advantage:** downloads count against the logged-in account's quota instead of the IP's. That matters only for paid accounts ([megajs network settings](https://github.com/qgustavor/megajs-docs/blob/main/docs/tutorial/network-settings.md), [help: transfer quota](https://help.mega.io/plans-storage/space-storage/transfer-quota)).

### App key

- The documented request URL includes `ak=appkey`, and `API_EAPPKEY (-22)` means "Invalid application key" ([mega.io/developers](https://mega.io/developers)). The C++ SDK's `MegaApi` constructor takes an `appKey` ([`megaapi.h`](https://github.com/meganz/sdk/blob/master/include/megaapi.h)).
- **No published page explains how to obtain one.** The developers page's "API access authorization" section only points to GitHub and a contact form.
- megajs never sends `ak` ([`lib/api.mjs`](https://github.com/qgustavor/mega/blob/next/lib/api.mjs)). **Observed:** an anonymous POST to `https://g.api.mega.co.nz/cs` without `ak` returned a normal result.
- Conclusion: an app key is not technically required today, but see the ToS below.

## 2. Browser feasibility

- **CORS on the API host (observed):** `g.api.mega.co.nz/cs` answers preflight and POST from `Origin: https://example.com` with `Access-Control-Allow-Origin: *`. It allows the headers `Content-Type, X-Hashcash` and exposes `X-Hashcash`.
- **Hashcash:** the API may demand a proof-of-work via the `X-Hashcash` header. megajs implements it "largely the same as official's web client" since v1.3.7 ([changelog](https://github.com/qgustavor/mega/blob/next/changelog.md)).
- **CORS on storage hosts (observed):** `gfs214n116.userstorage.mega.co.nz` sends `Access-Control-Allow-Origin: *` on both GET and OPTIONS. Another sampled host did not respond at all.
- **Range reads:** byte ranges are a URL suffix, `<g-url>/<start>-<end>`, not a `Range` header. Requests stay simple CORS GETs with no preflight. Both MEGA's own webclient ([`js/utils/network.js` `megaUtilsGFSFetch`](https://github.com/meganz/webclient/blob/master/js/utils/network.js)) and megajs ([`lib/file.mjs` `download`](https://github.com/qgustavor/mega/blob/next/lib/file.mjs)) do this.
- **Range decryption:**
  - AES-CTR allows decrypting any 16-byte-aligned offset. MEGA's webclient decrypts ranges with native WebCrypto `AES-CTR` ([network.js](https://github.com/meganz/webclient/blob/master/js/utils/network.js)).
  - megajs supports `download({ start, end })` ([API docs](https://github.com/qgustavor/megajs-docs/blob/main/docs/api.md)).
  - Integrity (chunked CBC-MAC) can only be verified on a full download. megajs disables verification for partial reads ([mega.io/developers, "integrity-checked partial reads" listed as future](https://mega.io/developers), [megajs security doc](https://github.com/qgustavor/megajs-docs/blob/main/docs/tutorial/security.md)).
- **Decryption cost:**
  - megajs's browser build does AES in pure JS (sjcl) block by block ([`browser/aes.mjs`](https://github.com/qgustavor/mega/blob/next/browser/aes.mjs)), not WebCrypto.
  - No primary source gives throughput numbers. The cost for a 100+ MB PDF is **unverified**.
  - If it is too slow, the fallback is a thin custom download path that uses WebCrypto AES-CTR, as MEGA's webclient does.
- **Browser quirks:**
  - In browsers, set `userAgent: null`, because a custom User-Agent causes CORS failures on Firefox ([megajs API docs](https://github.com/qgustavor/megajs-docs/blob/main/docs/api.md), [login tutorial](https://github.com/qgustavor/megajs-docs/blob/main/docs/tutorial/login.md)).
  - The browser build defaults to `forceHttps: true`, which is needed for mixed-content rules.

## 3. Libraries

| | Status | License | Maintenance |
|---|---|---|---|
| MEGA official SDK | C++ only ("client access engine"), plus bindings for Java, iOS and Qt. No official JS/browser SDK ([mega.io/developers](https://mega.io/developers), [meganz/sdk](https://github.com/meganz/sdk)) | BSD-2-Clause | Active (pushed 2026-10) |
| MEGA webclient | Official browser client, but an app, not a library ([meganz/webclient](https://github.com/meganz/webclient)) | No SPDX license detected; MEGA's own terms | Active |
| `megajs` | **Unofficial**: "all unofficial, based on developer guide and site source" ([README](https://github.com/qgustavor/mega)) | MIT | Single maintainer. v1.3.10 released 2026-04-20, 7 open issues, ~194 stars |

- megajs runs in browsers without a proxy. Restoring browser support was a stated reason for the fork, and browser builds are tested via Deno on each release ([platform compatibility](https://github.com/qgustavor/megajs-docs/blob/main/docs/platform-compatibility.md)).
- The project is Node-first: "mostly used and tested on this platform".
- It is small enough to audit, and the read path we need (folder link, tree, navigate, ranged download) is a few hundred lines. Vendoring or forking it is a realistic fallback.

## 4. Limits

- **Free accounts and anonymous link downloads:** limited by "the amount of data downloaded from your IP address over the past six hours". The size varies by location and network load, and MEGA publishes no fixed number. Paid accounts are metered per account, not per IP ([help: transfer quota](https://help.mega.io/plans-storage/space-storage/transfer-quota), [mega.io/developers, Bandwidth quota](https://mega.io/developers)).
- **Per-file threshold:** "Transfer quota only begins to apply to a given file once that file has been transferred in full more than 10 times", and partial transfers count proportionally ([help: transfer quota](https://help.mega.io/plans-storage/space-storage/transfer-quota)).
  - For a personal library this likely makes quota a non-issue for books.
  - `metadata.db`, re-downloaded on every visit, could cross the threshold. That argues for caching it in the browser (HLD open question 3).
  - **Unverified:** whether a changed `metadata.db` (a new file version) resets the count.
- **When exceeded:**
  - The API rejects the download with `EOVERQUOTA (-17)`. Running downloads can be interrupted and retried later ([mega.io/developers](https://mega.io/developers)).
  - Storage hosts return HTTP 509 with an `x-mega-time-left` header ([megajs `lib/file.mjs`](https://github.com/qgustavor/mega/blob/next/lib/file.mjs)).
  - **Unverified:** whether that header is readable cross-origin. The observed CORS responses expose no headers on storage hosts. If it isn't readable, the UI can only say "quota exceeded, try later".
- **Owner-funded quota:** paid owners can grant a share of their transfer quota (25% by default) to people downloading from their links. On Pro Flexi and Business plans, overage is billed to the owner ([help: grant transfer quota](https://help.mega.io/files-folders/transfers/grant-transfer-quota)). That cost falls on the user, never on us.
- **API rate limiting:** applied per IP by command "weight". Respond to `EAGAIN` with exponential backoff ([mega.io/developers](https://mega.io/developers)).
- **Effect on the design:** every request goes from the user's browser to MEGA, so quota is per user's IP and nothing accrues to us. No server, proxy, or recurring cost is forced.

## Licensing and ToS

- MEGA's Terms (Intellectual property → Our IP): "you may only directly and specifically use the API if you register at the developer registration page and agree that you will only publish or make available your application after we have approved it pursuant to our application approval process and licence agreement available on request at api@mega.io". MEGA "may revoke access to, or change, our API at any time without notice" ([mega.io/terms](https://mega.io/terms)).
- megajs also tells users to agree to MEGA's ToS ([README](https://github.com/qgustavor/mega)).
- No published "developer registration page" or self-serve app-key flow could be found. **Action:** email `api@mega.io` before making the MEGA adapter available beyond personal use.

## Prototype: what remains to test

Feasibility is settled by the sources above. A short browser prototype should measure and confirm only these:

1. From a static page on a non-MEGA origin (e.g. `localhost` or a `*.pages.dev` host), `File.fromURL(folderLink)` → `loadAttributes()` → `navigate('metadata.db')` → `downloadBuffer()` works with `userAgent: null` in Chrome, Firefox and Safari.
2. A ranged read (`download({start, end})`) of a cover and of a 1 MB slice in the middle of a large PDF succeeds and decrypts correctly.
3. Time to decrypt a 100–300 MB PDF with megajs's pure-JS AES, compared with WebCrypto AES-CTR. Decide whether a custom download path is needed.
4. Tree-load time and payload size for a large library (thousands of book folders) through one folder link.
5. On a 509 response, whether `x-mega-time-left` is readable from JS cross-origin.

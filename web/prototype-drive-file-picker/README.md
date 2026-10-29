# PROTOTYPE #156: `drive.file` + Google Picker folder access

Throwaway. Lives on `prototype/drive-file-picker` and is never merged.

One page, served on `http://localhost:8156` under the production CSP and `Referrer-Policy` read
from `deploy/cloudflare/_headers`, plus only the additions in `csp-additions.json`. It signs in by
redirect (OAuth implicit flow, `drive.file` only), so the Picker is the only thing that needs CSP
additions. Every CSP violation on the page is listed live, and the server logs `report-uri` posts.

## One-time setup (owner)

1. Create a **new** Google Cloud project, so no `drive.readonly` grant from the real app's project
   is involved. Its **project number** is `PICKER_APP_ID`.
2. Enable **Google Drive API** and **Google Picker API**.
3. Google Auth Platform: audience External, status Testing, test user `golu3990@gmail.com`.
   Data access: add `.../auth/drive.file` and nothing else.
4. Clients → Web application. JavaScript origin `http://localhost:8156`, redirect URI
   `http://localhost:8156/`. The client ID is `PICKER_CLIENT_ID`.
5. Credentials → API key, restricted to the Picker API, website restriction `https://docs.google.com/*`
   (what the Picker guide prescribes). It is `PICKER_API_KEY`.
6. Write `web/prototype-drive-file-picker/.env.local` (gitignored):

   ```
   PICKER_CLIENT_ID=...
   PICKER_API_KEY=...
   PICKER_APP_ID=...
   ```

## Run

`pnpm prototype:drive-file`, then open `http://localhost:8156`.

| Step | Do |
|---|---|
| CSP | Open `/?csp=prod`, sign in, click a Pick button: the violations are what production would block. Then go back to `/`. |
| 1 | Sign in, click **Pick: My Drive library root**, choose the library root folder. |
| 2–4, 7 | Click **Walk my-drive**. |
| 5 | Close the tab. In a new tab, sign in again, don't pick, click **Walk my-drive**. |
| 6 | Add a book in Calibre, let Drive for desktop sync it (signed in as the test account), then **Walk my-drive** again. The result diffs against the previous walk. |
| 7 | Repeat Pick + Walk with **shared-with-me** and **shared-drive**. |
| Referrer | If the Picker fails under `no-referrer`, retry from the third link at the top. |

Compare each walk's file and folder totals with the library on disk:
`find <library> -type f ! -name .DS_Store | wc -l` and `find <library> -mindepth 1 -type d | wc -l`.

**Copy** puts the results Markdown on the clipboard for #156. It holds counts and statuses, not
book titles. **Wipe all prototype state** clears the page's local storage.

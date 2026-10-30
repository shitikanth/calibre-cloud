# PROTOTYPE #156: `drive.file` + Google Picker folder access

Throwaway. Lives on `chore/prototype-drive-file-picker` and is never merged.

One page, served on `http://localhost:8787` under the production CSP and `Referrer-Policy` read
from `deploy/cloudflare/_headers`, plus only the additions in `csp-additions.json`. It signs in by
redirect (OAuth implicit flow, `drive.file` only), so the Picker is the only thing that needs CSP
additions. Every CSP violation on the page is listed live, and the server logs `report-uri` posts.

It uses the live app's project and OAuth client (owner's call; the issue asked for a fresh client).
Sign-in lands on the client's existing `wrangler dev` redirect URI,
`http://localhost:8787/api/auth/google/callback`, so stop `wrangler dev` first. The client ID comes
from `deploy/cloudflare/.dev.vars`. The page asks for a `drive.file`-only token and flags any other
granted scope, so the live app's `drive.readonly` grant can't leak in. Folders picked here stay
granted to this project, so a later `drive.file` re-test here would not start clean.

## One-time setup (owner)

1. In the live app's Cloud project, enable **Google Picker API**.
2. Credentials → API key. API restriction: Google Picker API (the page calls Drive with the OAuth
   token, not the key). Website restrictions: `http://localhost:8787/*` and `https://docs.google.com/*`;
   the Picker guide requires both. "API developer key is invalid" in the Picker means this step.
3. Write `web/prototype-drive-file-picker/.env.local` (gitignored):

   ```
   PICKER_API_KEY=<the key from step 2>
   PICKER_APP_ID=<the project number>
   ```

4. Test folders, each holding a full copy of the same Calibre library:
   - My Drive of the test account, kept in sync by Drive for desktop signed in as the test account (step 6).
   - A folder another account shares to the test account.
   - A folder in a shared drive the test account is a member of. Shared drives need a Workspace
     account to create one.

If sign-in rejects the scope, add `.../auth/drive.file` under Google Auth Platform → Data access.

## Run

`pnpm prototype:drive-file`, then open `http://localhost:8787`.

| Step | Do |
|---|---|
| CSP | Open `/?csp=prod`, sign in, click a Pick button: the first violation is the first thing production blocks. Copy, then go to `/` and repeat until a pick shows no violations. To prove each entry in `csp-additions.json` is needed, delete it (the server re-reads the file per request), reload, pick, copy, restore it. |
| 1 | Sign in, click **Pick: My Drive library root**, choose the library root folder. |
| 2–4, 7 | Click **Walk my-drive**. |
| 5 | Close the tab. In a new tab, sign in again, don't pick, click **Walk my-drive**. |
| 6 | Add a book in Calibre, let Drive for desktop sync it (signed in as the test account), then **Walk my-drive** again. The result diffs against the previous walk. |
| 7 | Repeat Pick + Walk with **shared-with-me** and **shared-drive**. |
| Referrer | If the Picker fails under `no-referrer`, retry from the third link at the top. |

Compare each walk's counts with the library on disk:

- Step 2 root children: `find <library> -mindepth 1 -maxdepth 1 ! -name .DS_Store | wc -l`
- Files: `find <library> -type f ! -name .DS_Store | wc -l`
- Folders: `find <library> -mindepth 1 -type d | wc -l`

**Copy** puts the results Markdown on the clipboard for #156. It holds counts and statuses, not
book titles. Walk results persist across tabs; CSP violations are per page load, so copy them before
navigating. **Wipe all prototype state** clears the page's storage.

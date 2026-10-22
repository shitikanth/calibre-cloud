# Research: reading a Calibre library from Google Drive in the browser

Question: can calibre-cloud read a whole Calibre library from Google Drive, entirely from the browser,
without a restricted OAuth scope, and what OAuth and consent limits apply to a personal-use MVP?
Answers HLD risk 1 (`docs/hld.md`). Researched 2026-10-22 against Google's own docs, help center,
blogs and issue tracker; page "last updated" dates are quoted where they matter.

## Bottom line

- **`drive.file` + Picker folder selection: unproven.** Google's docs never say whether picking a
  folder grants access to its descendants. Only a prototype can settle it.
- **`drive.readonly` works today for a handful of users, at no cost**, under Google's "personal use"
  exemption: publish the app as *In production* without submitting it for verification. Users click
  through an "unverified app" warning; lifetime cap of 100 users; no 7-day refresh-token expiry (that
  is a *Testing* rule). No verification is submitted, so no CASA assessment is triggered.
- **Recommendation:** build the Drive adapter on `drive.readonly`, published unverified *In
  production*. Keep `drive.file` as the target for any public launch; run the prototype below first.

## 1. Does picking a folder under `drive.file` grant access to its descendants?

**Google's docs say nothing either way.** What they do say:

- The scope table defines `drive.file` as files "that you open with an app or that the user shares
  with an app while using the Google Picker API or the app's file picker". Nothing on folders or
  children. The same page calls it "per-file access", says it "works with all Drive API REST
  Resources", and urges restricted-scope apps to migrate to it.
  [Choose Drive API scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth)
- `DocsView.setSelectFolderEnabled` says only "Allows the user to select a folder in Google Drive."
  [reference](https://developers.google.com/workspace/drive/picker/reference/picker.docsview.setselectfolderenabled)
- The web and desktop/mobile Picker guides (both updated 2026-10-12) document folder selection
  (`setSelectFolderEnabled`, `allow_folder_selection=true`) but not what it grants. The web guide notes
  that under narrower scopes "the user hasn't granted access to thumbnails" and recommends list mode.
  [web](https://developers.google.com/workspace/drive/picker/guides/web-picker),
  [desktop/mobile](https://developers.google.com/workspace/drive/picker/guides/desktop-mobile-picker)
- Google's 2013 blog post on folder selection presents the picked folder only as an *upload
  destination*, not as readable content.
  [blog](https://gsuite-developers.googleblog.com/2013/08/selecting-upload-destinations-with.html)

**Changes from 2024 to 2026**, none of which addresses `drive.file` folder grants:

- `DocsView.setFileIds` (Picker opens on given file IDs), announced 2024-11-21, rolled out from
  2025-01-20. Useless here: the app would need the child IDs first.
  [Workspace Updates](https://workspaceupdates.googleblog.com/2024/11/new-file-picker-method-for-pre-selecting-google-drive-files.html)
- Desktop/mobile Picker (`drive.file` only), following issue
  [322267485](https://issuetracker.google.com/issues/322267485) ("Google Drive Picker For iOS and
  Android", filed 2024-01-25); and the `<drive-picker>`
  [web component](https://developers.google.com/workspace/drive/picker/guides/web-component).
- Folders with limited access (GA 2025-02-19) and expansive access (enforced 2026) change *sharing*
  inheritance, not OAuth grants. [Drive release notes](https://developers.google.com/workspace/drive/release-notes)

**Issue tracker:** no public issue found that settles it; tracker search and comment threads need
sign-in. **Community posts conflict** (some say contents are inaccessible, some assume accessible),
and none is a Google statement or a recorded test; one planned test was abandoned
([example](https://github.com/Steuten-IT-Solutions/Kompanie-App-Template/issues/40)).

**Design consequences even if folder grants do propagate:**

- `metadata.db` holds no Drive file IDs, so the app must *list* children (`files.list`,
  `q='<id>' in parents`) to resolve `Author/Title (id)/file.epub`. Listing must work, not just `files.get`.
- Books added later, and a `metadata.db` that sync may replace under a new file ID, need the grant to
  cover children created *after* the pick. Per-file multi-select would miss them, and picking thousands
  of files by hand isn't realistic (`MULTISELECT_ENABLED`/`setMaxItems` have no documented upper bound).
  [Feature](https://developers.google.com/workspace/drive/picker/reference/picker.feature)

## 2. Alternatives and their costs

| Scope | Classification | Lists the whole library? |
|---|---|---|
| `drive.file` | Non-sensitive | Only if folder grants propagate (unverified) |
| `drive.readonly` | **Restricted** | Yes |
| `drive.metadata.readonly` | **Restricted** | Lists, but can't download |

Sources: [scopes page](https://developers.google.com/workspace/drive/api/guides/api-specific-auth),
[restricted scope list](https://support.google.com/cloud/answer/13464325). `drive.metadata.readonly`
is no cheaper than `drive.readonly`, so pairing it with `drive.file` gains nothing.

**Publishing status *Testing*** ([Manage App Audience](https://support.google.com/cloud/answer/15549945)):
up to 100 listed test users, each shown an unverified-app warning. "Authorizations by a test user will
expire seven days from the time of consent", refresh tokens included. This applies to **any** scope
beyond `openid`/email/profile, `drive.file` included; the
[OAuth 2.0 overview](https://developers.google.com/identity/protocols/oauth2) says the same.

**Publishing status *In production*, unverified:** restricted or sensitive scopes show the
"unverified app" screen and are capped at "100 new users in total" for the project's lifetime (can't be
reset). No 7-day expiry. With non-sensitive scopes only (`drive.file`), verification isn't mandatory and
there is no unverified-app screen; brand verification is needed only to show the app name and logo.
[Unverified apps](https://support.google.com/cloud/answer/7454865),
[OAuth verification](https://support.google.com/cloud/answer/13463073)

**Personal-use exemption** ([When is verification not needed](https://support.google.com/cloud/answer/13464323)):

> "If the app is for your personal use (fewer than 100 users), you and your limited number of users can
> continue using the app without going through verification (users will be allowed to click through
> 'unverified app' warning screens during sign-in)."

The restricted-scope guide (updated 2026-08-19) adds: "if you are the only user of your app or if your
app is used by only a few users, all of whom are known personally to you".
[Restricted scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification)

**What triggers CASA:**

- It is the last step of *restricted-scope verification*, entered only by submitting a production app
  (to lift the cap and the warning); "the Google Trust and Safety team will contact you".
  [Security Assessment](https://support.google.com/cloud/answer/13465431)
- It applies, annually, to apps that "access restricted data from or through a third-party server" or
  "store or transmit restricted scope data on servers"
  ([restricted-scope guide](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification)).
  Google charges nothing; assessors set fees; some apps qualify for a free self-scanned Tier 2
  ([FAQ](https://support.google.com/cloud/answer/13463817)).
- Open: whether a stateless refresh function briefly holding refresh tokens counts as access "through a
  server". Matters only if we ever seek verification.

**Other token limits** ([OAuth 2.0 overview](https://developers.google.com/identity/protocols/oauth2)):
100 live refresh tokens per account per client ID (the oldest is silently invalidated); refresh tokens
die after 6 months unused or on revocation; users may grant time-based access that lapses.

## 3. Browser feasibility

- **CORS:** the GIS token-model guide says access tokens are for "authenticated requests to Google APIs
  via REST and CORS" ([token model](https://developers.google.com/identity/oauth2/web/guides/use-token-model)).
  Observed 2026-10-22: a preflight `OPTIONS` to `www.googleapis.com/drive/v3/files/<id>?alt=media` from
  `Origin: https://example.com` echoed the origin in `access-control-allow-origin` and returned
  `access-control-allow-headers: authorization,range`; `files.list` responses carry the origin header too.
- **Range:** `files.get?alt=media` downloads blob content; "use a byte range with the Range header",
  e.g. `Range: bytes=500-999` (not for Workspace-doc exports, irrelevant here).
  [Download files](https://developers.google.com/workspace/drive/api/guides/manage-downloads) (updated
  2026-09-03). Unverified: whether a 206 response exposes `Content-Range` to JavaScript.
- **OAuth flow** ([Choose an authorization model](https://developers.google.com/identity/oauth2/web/guides/choose-authorization-model)):
  the *token model* gives no refresh token, and each new access token needs a user gesture; no backend.
  The *code model* is "recommended": refresh tokens and offline use, but it needs a backend to exchange
  the code with the client secret, plus refresh-token storage. Since HLD functions store nothing, the
  refresh token would live client-side (e.g. an HttpOnly cookie on our domain) and be passed to a
  stateless refresh function.
- **Picker** needs an access token (`setOAuthToken`), an API key, and `setAppId` (the Cloud project
  number) to grant files to the app. [web Picker guide](https://developers.google.com/workspace/drive/picker/guides/web-picker)

## 4. Recommendation and the prototype still needed

**MVP:** `drive.readonly`, app *In production* and unverified, under 100 users. GIS code model (popup)
with a stateless serverless code-exchange/refresh function, so sessions are long with no 7-day expiry.
Book bytes go browser to Drive directly with `Range`, never through us. Cost: none; users see an
"unverified app" click-through. Avoid *Testing*: it adds the test-user list and 7-day re-consent.

**Prototype (needed only if we want `drive.file`).** Real Google account, real Calibre library folder
in My Drive, fresh OAuth client requesting only `drive.file`, `setAppId` set.

1. Pick only the library root with `DocsView().setIncludeFolders(true).setSelectFolderEnabled(true)`.
2. `files.list` with `q="'<root>' in parents"`. Does it return every child, or none?
3. Recurse to `Author/` then `Title (id)/`. Do subfolders list?
4. `files.get?alt=media` with a `Range` header on `metadata.db`, a `cover.jpg`, and a nested EPUB:
   200/206, or 403/404?
5. New session, new access token, no re-pick: is access still there?
6. Add a book in Calibre and let Drive sync; repeat 2–4 on the new files. Let Calibre rewrite
   `metadata.db`: did its file ID change, and is it still readable?
7. Record `capabilities.canListChildren` on the root. Repeat for a folder shared *to* the user and a
   shared-drive folder (`setEnableDrives(true)`).

If 2–6 all pass, `drive.file` is viable with no restricted-scope verification or CASA. If 2 or 6 fails,
`drive.file` is ruled out for this app.

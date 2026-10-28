# Deploy checklist (owner)

CD runs on Cloudflare Workers Builds, connected to the `calibre-cloud` Worker. CI runs on GitHub Actions (`.github/workflows/ci.yml`). Neither needs a Cloudflare API token or GitHub secrets.

These steps need the owner's Cloudflare and GitHub access.

## 1. Workers Builds settings

Production and preview builds both run from the repo root, so Workers Builds' own `pnpm install --frozen-lockfile` installs the whole workspace.

| Setting | Production (`main`) | Previews (other branches) |
|---|---|---|
| Root directory | `/` | `/` |
| Build command | `pnpm run build` | `pnpm run build` |
| Deploy command | `pnpm --filter @calibre-cloud/deploy-cloudflare run release` | `pnpm --filter @calibre-cloud/deploy-cloudflare exec wrangler preview` |

- `release` is `wrangler deploy`. Nothing smoke-checks the deployed app: CI's `smoke:local` runs the same checks against the built app under `wrangler dev` before merge.
- `wrangler preview` needs the `previews` block in `wrangler.jsonc`. It is empty because Previews need no settings of their own.
- The Worker needs workers.dev and preview URLs enabled. `wrangler.jsonc` sets `workers_dev: true` and `preview_urls: true`, but they only take effect on a production deploy, so enable them on the Worker before the first one.

Check or change the settings with the Cloudflare CLI (`npx cf`):

- `npx cf builds workers get <worker-tag>` shows both columns of the table.
- `npx cf builds workers update <worker-tag> --production-settings-build-command ... --previews-base-config-deploy-command ...` changes them.
- `npx cf builds logs get <build-uuid>` prints a build's log. The build UUID is in the Workers Builds check on the commit.

## 2. Branch protection on `main`

GitHub → Settings → Branches (or Rules → Rulesets) → `main`.

- [ ] Require a pull request before merging.
- [ ] Require status checks to pass, with the check **`ci`** (the job in `.github/workflows/ci.yml`). It appears in the picker after CI has run once on a PR.
- [ ] Optionally also require the Workers Builds check, so a PR whose preview build fails can't merge.

## 3. Verify the first deploy

- [ ] Merge the scaffold PR and check that the Workers Builds check on the `main` commit passes.
- [ ] Open `https://calibre-cloud.<your-subdomain>.workers.dev/` and a deep link such as `/smoke/deep-link`. Both should load the app.
- [ ] Open a test PR and check that Workers Builds comments with a preview URL.

## 4. Google sign-in

The Worker runs the auth routes under `/api/auth/` (the only paths that reach it before the static assets; see `run_worker_first` in `wrangler.jsonc`). It reads three values, none of them committed:

| Worker variable | Value |
|---|---|
| `GOOGLE_CLIENT_ID` | The OAuth client's ID. |
| `GOOGLE_CLIENT_SECRET` | The OAuth client's secret. |
| `AUTH_COOKIE_KEY` | 32 random bytes in base64, from `openssl rand -base64 32`. It encrypts the sign-in cookie, so changing it signs everyone out. |

Until all three are set, the auth routes answer `500 {"error":"not-configured","missing":[...]}`, and the rest of the app is unaffected.

- [ ] In Google Cloud → APIs & Services → Credentials, make the OAuth client a *Web application* with exactly these authorized redirect URIs:
  - `https://calibre-cloud.golu3990.workers.dev/api/auth/google/callback`
  - `https://slice-google-drive-calibre-cloud.golu3990.workers.dev/api/auth/google/callback`
  - `http://localhost:8787/api/auth/google/callback`
- [ ] Set the three values on production, from `deploy/cloudflare/`: `wrangler secret put GOOGLE_CLIENT_ID`, then the same for `GOOGLE_CLIENT_SECRET` and `AUTH_COOKIE_KEY`. Set the client ID as a secret too, not a plain variable: `wrangler deploy` replaces plain variables set in the dashboard with the ones in `wrangler.jsonc`, which has none.
- [ ] Set them for Previews: `wrangler preview base-config secret put GOOGLE_CLIENT_ID`, and the same for the other two. Previews deployed afterwards get them, so push to the slice branch to redeploy its preview.
- [ ] Check: `pnpm --filter @calibre-cloud/deploy-cloudflare run smoke:deployed <origin>` now passes its auth checks (`/api/auth/google/start` redirects to Google).

For `wrangler dev`, put the same three values in `deploy/cloudflare/.dev.vars` (gitignored), one `NAME=value` per line, and open the app at `http://localhost:8787`, not `127.0.0.1`: the callback URI is built from the address in the browser.

## Local commands

- `pnpm lint`, `pnpm typecheck`, `pnpm test`: what CI runs.
- `pnpm build`: builds the SPA into `deploy/cloudflare/dist` with `_headers`.
- `pnpm --filter @calibre-cloud/deploy-cloudflare run smoke:local`: serves `dist` with `wrangler dev` and runs the smoke check against it: the CSP directive by directive, the pdf.js worker and wasm files, the smoked routes including the reader's not-connected state, and the auth routes (start redirects to Google; refresh without a sign-in asks to reconnect). It passes dummy values for the three Worker variables, so it needs no `.dev.vars`.
- MEGA adapter smoke test: put `MEGA_SMOKE_LINK="<shared folder link to a test library>"` in `.env.local` at the repo root (gitignored). Keep the quotes: unquoted, everything from `#` on is read as a comment and the key is lost. `pnpm test` then also runs `web/src/storage/mega/adapter.smoke.test.ts` against real MEGA. It's skipped when the variable is missing and always skipped when `CI` is set. Never commit or paste the link anywhere else.
- `pnpm --filter @calibre-cloud/deploy-cloudflare run smoke:deployed <origin>`: runs the smoke check by hand against a deployed preview or production URL. Its auth checks fail until that deployment has the section 4 values. Run `pnpm build` first on the commit that is deployed there: the check reads the names of the pdf.js worker and wasm files from `dist`, and a build of another commit can name the worker differently.
- `wrangler login` is needed only to deploy from a laptop with `pnpm --filter @calibre-cloud/deploy-cloudflare run release`. Workers Builds doesn't need it.

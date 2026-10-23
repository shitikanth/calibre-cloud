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

- `release` installs headless Chromium, runs `wrangler deploy`, then loads `/` and a deep link on the deployed `workers.dev` URL. The build fails on any console error, uncaught error, CSP violation, missing CSP header, non-2xx response, or empty `#root`.
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

- [ ] Merge the scaffold PR and open the Workers Builds log for the `main` build. It should end with `Smoke check passed`.
- [ ] Open `https://calibre-cloud.<your-subdomain>.workers.dev/` and a deep link such as `/smoke/deep-link`. Both should load the app.
- [ ] Open a test PR and check that Workers Builds comments with a preview URL.

### If the smoke check can't start Chromium

The Workers Builds image (Ubuntu 24.04) doesn't document Chromium's system libraries. If `pnpm run release` deploys and then fails with `browserType.launch` and a missing shared library:

1. Change the build command to `pnpm install --frozen-lockfile && pnpm --filter @calibre-cloud/deploy-cloudflare exec playwright install-deps chromium && pnpm run build`. This needs root in the build container, which isn't documented either.
2. If that also fails, open an issue. Running the smoke check against the deployed URL from GitHub Actions is the fallback.

## Local commands

- `pnpm lint`, `pnpm typecheck`, `pnpm test`: what CI runs.
- `pnpm build`: builds the SPA into `deploy/cloudflare/dist` with `_headers`.
- `pnpm --filter @calibre-cloud/deploy-cloudflare run smoke:local`: serves `dist` with `wrangler dev` and runs the smoke check against it, including the CSP.
- `pnpm --filter @calibre-cloud/deploy-cloudflare run smoke:deployed <origin>`: runs the smoke check against any deployed URL.
- `wrangler login` is needed only to deploy from a laptop with `pnpm --filter @calibre-cloud/deploy-cloudflare run release`. Workers Builds doesn't need it.

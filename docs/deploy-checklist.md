# Deploy checklist (owner)

CD runs on Cloudflare Workers Builds, connected to the `calibre-cloud` Worker. CI runs on GitHub Actions (`.github/workflows/ci.yml`). Neither needs a Cloudflare API token or GitHub secrets.

These steps need the owner's Cloudflare and GitHub access. Agents don't do them.

## 1. Workers Builds settings

Cloudflare dashboard → Workers & Pages → `calibre-cloud` → Settings → Build.

- [ ] **Git repository:** `shitikanth/calibre-cloud`, production branch `main`.
- [ ] **Root directory:** `deploy/cloudflare`. Workers Builds requires the `name` in the Wrangler config in this directory to match the Worker name, and `deploy/cloudflare/wrangler.jsonc` has `name: calibre-cloud`.
- [ ] **Build variable:** `SKIP_DEPENDENCY_INSTALL` = `1`. The lockfile is at the repo root, outside the root directory, so the build command installs the workspace itself.
- [ ] **Build command:** `pnpm install --frozen-lockfile && pnpm run build`
- [ ] **Deploy command:** `pnpm run release`. It installs headless Chromium, runs `wrangler deploy`, then loads `/` and a deep link on the deployed `workers.dev` URL. The build fails on any console error, uncaught error, CSP violation, missing CSP header, non-2xx response, or empty `#root`.
- [ ] **Non-production branch builds:** enabled, with the default preview command (`npx wrangler preview`). It needs the `previews` block in `wrangler.jsonc`, which is empty because Previews need no settings of their own. This builds every PR branch and posts its preview URL on the PR.
- [ ] **workers.dev route:** enabled (Settings → Domains & Routes). `wrangler.jsonc` sets `workers_dev: true` and `preview_urls: true`.

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
- MEGA adapter smoke test: put `MEGA_SMOKE_LINK=<shared folder link to a test library>` in `.env.local` at the repo root (gitignored). `pnpm test` then also runs `web/src/storage/mega/adapter.smoke.test.ts` against real MEGA. It's skipped when the variable is missing and always skipped when `CI` is set. Never commit or paste the link anywhere else.
- `pnpm --filter @calibre-cloud/deploy-cloudflare run smoke:deployed <origin>`: runs the smoke check against any deployed URL.
- `wrangler login` is needed only to deploy from a laptop with `pnpm --filter @calibre-cloud/deploy-cloudflare run release`. Workers Builds doesn't need it.

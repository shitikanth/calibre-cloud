# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

pnpm workspace: `web/` (the SPA), `api/` (the platform-neutral API core), and `deploy/cloudflare/` (the Worker entry, its config, and deploy scripts).

- `pnpm lint`, `pnpm typecheck`, `pnpm test`: the local checks. Tests use Vitest; `web/` runs in browser mode (Playwright Chromium). CI runs `pnpm test:coverage` in place of `pnpm test`.
- `pnpm build`: builds the SPA into `deploy/cloudflare/dist`.
- `pnpm --filter @calibre-cloud/deploy-cloudflare run smoke:local`: smoke-checks the build, CSP included, under `wrangler dev`.

Deployment is Cloudflare Workers Builds; the owner's dashboard settings are in `docs/deploy-checklist.md`.

## Design

A serverless Calibre library viewer: browse and read a Calibre library from Google Drive, Dropbox, or MEGA in the browser. The design is in `docs/hld.md`. Read it before any architectural change.

Ask before breaking any of these, from `docs/hld.md`:

- Client-first. Serverless functions handle only what a browser can't, and store nothing.
- Costs scale to zero. Book files and `metadata.db` never go through our backend.
- Read-only access to the user's library.
- Storage providers sit behind a common adapter, and nothing above it knows which provider is in use.

## Agent skills

### Issue tracker

Issues live in this repo's GitHub Issues, managed with the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five default triage labels are used as-is. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

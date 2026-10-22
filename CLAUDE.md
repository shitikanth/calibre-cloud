# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project state

Pre-code: the repo has only docs. No stack, build, lint, or test commands exist yet.

## Design

A serverless Calibre library viewer: browse and read a Calibre library from Google Drive, Dropbox, or MEGA in the browser. The design is in `docs/hld.md`. Read it before any architectural change.

Ask before breaking any of these, from `docs/hld.md`:

- Client-first. Serverless functions handle only what a browser can't, and store nothing.
- Costs scale to zero. Book files and `metadata.db` never go through our backend.
- Read-only access to the user's library.
- Storage providers sit behind a common adapter, and nothing above it knows which provider is in use.

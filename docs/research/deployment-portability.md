# Research: deployment portability (Cloudflare vs AWS)

Status: research findings, 2026-10-22. Primary sources only. Feeds HLD risk 5 ("serverless platform not chosen").

**Question:** what does calibre-cloud's deployment surface look like on Cloudflare (Pages/Workers) vs AWS
(Amplify Hosting + Lambda), and what boundary lets the same function and frontend code run on both?

## Bottom line

- **Start on Cloudflare Workers with static assets, not Pages.** Cloudflare's Pages docs say: "Start new projects
  with Workers" [CF-pages]. One Worker serves the SPA build and the `/api/*` auth routes on one origin. Static
  asset requests are "free and unlimited" [CF-price]. The Free plan gives 100,000 Worker requests/day at $0 [CF-price].
- **Portability boundary = a Web-standard `(Request) => Promise<Response>` handler** that uses only WinterTC
  Minimum Common API globals (`fetch`, `Request`, `Response`, `URL`, `URLSearchParams`, `crypto.subtle`) [WTC].
  Secrets are passed in as a plain config object. **Business logic never reads `process.env` or `env` bindings.**
  Two small entry files adapt it to each platform. Hono is the cheapest documented adapter for this [Hono-CF] [Hono-L].
- **The frontend is a plain static SPA build (`dist/`)** that calls relative `/api/...` URLs. It runs unchanged
  on both platforms. Only the SPA-fallback, header, and proxy config differ, and those live in platform files.
- **No fixed cost on either path** if you avoid: Workers Paid ($5/mo minimum) [CF-price], AWS Secrets Manager
  ($0.40/secret/mo) [SM-price], Amplify WAF ($15/mo/app) [Amp-price], and Lambda Web Functions, which bill memory
  for an environment's whole life, including idle time between requests [LWF].

## 1. Platform surfaces

| Concern | Cloudflare Workers + static assets | AWS Amplify Hosting + Lambda (function URL) |
|---|---|---|
| Static hosting | `assets.directory` in `wrangler.jsonc`, uploaded with the Worker. Max 20,000 files and 25 MiB per file [CF-lim] | Amplify Hosting; build output "stored on CDN" [Amp-price] |
| Function runtime | V8 isolates. Start "around a hundred times faster than a Node process" [CF-how]. Free: 10 ms CPU per request, but network waits (`fetch()`) "do not count" [CF-lim]. 128 MB memory [CF-lim] | Node.js managed runtime. Cold starts are "under 100 ms to over 1 second", in "under 1% of invocations", and the cold-start time is billed [L-env] |
| Handler shape | `export default { fetch(request, env, ctx) }` takes a native `Request` [CF-fetch] | Event/JSON in "API Gateway payload format version 2.0". Binary bodies are base64 [L-inv] |
| Secrets / env | `wrangler secret put` or the dashboard. Read via `env` or `import { env } from "cloudflare:workers"`. Local values in `.dev.vars` / `.env` [CF-sec] | Function env vars ("encrypted at rest", 4 KB total) read via `process.env` [L-env-vars] [L-lim]. AWS recommends Secrets Manager, which costs money [SM-price]. SSM standard parameters are free [SSM-price] |
| Same-origin API (no CORS) | `assets.run_worker_first: ["/api/*"]` sends those paths to the Worker. Everything else is served as an asset [CF-spa] | Amplify "reverse proxy rewrite" (`200` rewrite to an external HTTPS URL), e.g. `/api/<*>` → function URL [Amp-rw] [Amp-ts] |
| SPA fallback | `not_found_handling: "single-page-application"` [CF-spa] | Regex `200` rewrite to `/index.html` [Amp-rw] |
| Custom headers | `_headers` file in the assets dir. Max 100 rules. Not applied to Worker-generated responses [CF-hdr] | `customHttp.yml` with per-pattern headers [Amp-hdr] |
| Custom domain + TLS | Requires an active Cloudflare zone, so DNS must be on Cloudflare. Certificate is automatic [CF-dom] | Any registrar/DNS. Free managed ACM certificate, auto-renewed [Amp-dom] [Amp-cert] |
| Free tier | 100k requests/day. Assets are free and unlimited [CF-price] | Lambda: 1M requests + 400k GB-s/month, "always free" [L-price]. Amplify: 1,000 build min, 5 GB storage, 15 GB egress/month **for 12 months** [Amp-price] |
| Idle cost | $0 | $0 (function URLs add no charge [L-furl]). CloudWatch Logs: 5 GB/month free, then $0.50/GB [CW-price] |

**AWS free-tier caveat.** Accounts created after 2025-07-15 get a 6-month free plan with up to $200 credits
instead of the legacy 12-month offers [AWS-free]. The Lambda allowance stays "always free" [L-price].
Whether Amplify's 12-month allowance still applies to new accounts is not stated (unverified, see below).
Past it, a handful of users costs cents ($0.15/GB served, $0.01/build-min) [Amp-price].

**Not recommended on AWS:**
- **API Gateway.** Its free tier is 1M calls [L-furl] and it adds a priced layer we don't need.
- **CloudFront OAC in front of a function URL.** For `POST`, clients "must compute the SHA256 of the body" and send
  `x-amz-content-sha256` [CF-OAC], which would leak platform detail into the frontend.
- **Lambda Web Functions.** They run Hono/Express with no adapter and scale to zero, but bill memory for an
  environment's whole life. No free tier is listed for them [L-price]. A custom domain needs CloudFront in front [LWF].

## 2. Portability boundary

WinterTC's Minimum Common Web API (Ecma TC55) standardises the globals: Fetch (`Request`/`Response`/`Headers`),
URL, `SubtleCrypto`, streams, `TextEncoder` and others. It **does not define a handler signature** [WTC]. So the
signature is our own choice: `handle(req: Request, cfg: AuthConfig): Promise<Response>`.

Documented adapters, in order of preference:

1. **Hono** (recommended). The same `app` is exported as `export default app` on Workers [Hono-CF] and as
   `export const handler = handle(app)` from `@hono/aws-lambda` on Lambda. That adapter supports function URLs and
   API Gateway, and auto-encodes binary bodies as base64 [Hono-L].
   - **Trap:** on Lambda, `c.env` holds `event`/`lambdaContext`, not secrets [Hono-L]. On Workers, `c.env` holds the
     bindings [Hono-CF]. Hono's `env(c)` helper hides this across runtimes, Lambda included [Hono-env]. Better still,
     build `AuthConfig` in the entry file and keep `c.env` out of business logic altogether.
   - **Streaming:** use `streamHandle` plus `RESPONSE_STREAM` invoke mode [Hono-L]. The auth flow doesn't need it.
2. **AWS Lambda Web Adapter** (AWS-maintained, Apache-2.0). It runs any HTTP server listening on a port, as a layer
   plus `AWS_LAMBDA_EXEC_WRAPPER`. It supports function URLs, API Gateway, and ALB, with optional streaming [LWA].
   Use it only if we ever need a Node server (`@hono/node-server`). It adds a layer and a readiness check for no
   gain at our size.

Limits that matter (auth payloads are a few KB, so none of these bind):
- Lambda: 6 MB request/response when buffered, 200 MB streamed. Streaming is native only on Node.js managed
  runtimes [L-lim] [L-stream].
- Workers Free: 100 MB request body, 50 subrequests, 10 ms CPU [CF-lim].
- Node APIs on Workers: `nodejs_compat` is on by default from compat date 2026-08-04. `child_process`,
  `worker_threads`, `vm` and `http2` are non-functional stubs [CF-node]. Rule: core code imports **no `node:*`
  modules**, so the Workers build is the strict one and Lambda is a superset.

## 3. Frontend build

- A Vite-style `dist/` is deployed as-is on both platforms. Only these differ:
  - SPA fallback: CF `not_found_handling` vs the Amplify regex rewrite.
  - Headers: `_headers` vs `customHttp.yml`.
  - The `/api` route: `run_worker_first` vs an Amplify proxy rewrite.
- Public build-time config (OAuth client IDs, redirect URI) is injected at build time and is platform-agnostic.
  Client secrets live only in the function's runtime config.
- **COOP/COEP:** SQLite WASM's `opfs` VFS needs `COOP: same-origin` + `COEP: require-corp` (for
  `SharedArrayBuffer`). The **`opfs-sahpool` VFS does not** [SQLite]. Under `require-corp`, cross-origin `no-cors`
  loads such as `<img src>` covers from Dropbox/Drive are blocked unless the provider sends CORP.
  `credentialless` relaxes that [MDN-COEP].
  - Recommendation: use `opfs-sahpool` and send no COEP. That removes a cross-platform header dependency and a
    risk for cover loading.
- **CSP:** set it in the same two header files. `connect-src` must allow each provider's API host and `/api`.

## 4. Recommended layout (minimal platform-specific surface)

```
src/                 # frontend: platform-agnostic
functions/core/      # auth logic: (Request, AuthConfig) => Response; WinterTC globals only, no node:*
functions/app.ts     # Hono routes under /api/*, call core with injected config
deploy/cloudflare/   # wrangler.jsonc (assets dir, SPA fallback, run_worker_first ["/api/*"]),
                     # entry.ts (export default { fetch: (req, env) => app.fetch(req, cfgFrom(env)) })
deploy/aws/          # entry.ts (handle(app) from @hono/aws-lambda, cfg from process.env),
                     # IaC for Lambda + function URL (auth NONE), Amplify rewrites JSON, customHttp.yml
public/_headers      # CF headers (Amplify ignores it; mirror in customHttp.yml)
```

- Switching to AWS means adding `deploy/aws/` and building the same `dist/`. Nothing in `src/` or `functions/core/`
  changes.
- Rewrite order matters: the `/api/<*>` proxy rule must come before the SPA catch-all.
- Keep a conformance test that runs `core` against a plain `Request` (Node's built-in `fetch` types) so both
  entries stay thin.

## Unverified / needs a spike

1. **Amplify reverse-proxy `POST` to a Lambda function URL.** The docs show the proxy rewrite and "reverse proxy to
   an API" [Amp-rw] [Amp-ts], but don't state method support, body forwarding, timeouts, or which headers
   CloudFront strips. Spike before relying on same-origin on AWS. Fallback: call the function URL cross-origin with
   its built-in CORS config [L-furl-cfg].
2. **Amplify Hosting 12-month free allowance for accounts created after 2025-07-15** (credits-based plan) [AWS-free].
3. **Cloudflare custom domain without moving DNS to Cloudflare.** Workers Custom Domains need a Cloudflare zone
   [CF-dom]. `*.workers.dev` avoids this, but its docs page could not be fetched during this research.

## Sources

- [CF-pages] https://developers.cloudflare.com/pages/
- [CF-price] https://developers.cloudflare.com/workers/platform/pricing/
- [CF-lim] https://developers.cloudflare.com/workers/platform/limits/
- [CF-spa] https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/
- [CF-hdr] https://developers.cloudflare.com/workers/static-assets/headers/
- [CF-sec] https://developers.cloudflare.com/workers/configuration/secrets/
- [CF-node] https://developers.cloudflare.com/workers/runtime-apis/nodejs/
- [CF-dom] https://developers.cloudflare.com/workers/configuration/routing/custom-domains/
- [CF-how] https://developers.cloudflare.com/workers/reference/how-workers-works/
- [CF-fetch] https://developers.cloudflare.com/workers/runtime-apis/handlers/fetch/
- [Amp-price] https://aws.amazon.com/amplify/pricing/
- [Amp-rw] https://docs.aws.amazon.com/amplify/latest/userguide/redirect-rewrite-examples.html
- [Amp-ts] https://docs.aws.amazon.com/amplify/latest/userguide/troubleshooting-redirects.html
- [Amp-hdr] https://docs.aws.amazon.com/amplify/latest/userguide/custom-header-YAML-format.html
- [Amp-dom] https://docs.aws.amazon.com/amplify/latest/userguide/custom-domains.html
- [Amp-cert] https://docs.aws.amazon.com/amplify/latest/userguide/using-certificates.html
- [AWS-free] https://aws.amazon.com/free/ and https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/billing-free-tier.html
- [L-price] https://aws.amazon.com/lambda/pricing/
- [L-furl] https://docs.aws.amazon.com/lambda/latest/dg/furls-http-invoke-decision.html
- [L-furl-cfg] https://docs.aws.amazon.com/lambda/latest/dg/urls-configuration.html
- [L-inv] https://docs.aws.amazon.com/lambda/latest/dg/urls-invocation.html
- [L-lim] https://docs.aws.amazon.com/lambda/latest/dg/gettingstarted-limits.html
- [L-env] https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtime-environment.html
- [L-env-vars] https://docs.aws.amazon.com/lambda/latest/dg/configuration-envvars.html
- [L-stream] https://docs.aws.amazon.com/lambda/latest/dg/configuration-response-streaming.html
- [LWF] https://docs.aws.amazon.com/lambda/latest/dg/web-functions.html
- [LWA] https://github.com/awslabs/aws-lambda-web-adapter
- [CF-OAC] https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-lambda.html
- [SM-price] https://aws.amazon.com/secrets-manager/pricing/
- [SSM-price] https://aws.amazon.com/systems-manager/pricing/
- [CW-price] https://aws.amazon.com/cloudwatch/pricing/
- [Hono-CF] https://hono.dev/docs/getting-started/cloudflare-workers
- [Hono-L] https://hono.dev/docs/getting-started/aws-lambda
- [Hono-env] https://hono.dev/docs/helpers/adapter
- [WTC] https://min-common-api.proposal.wintertc.org/
- [SQLite] https://sqlite.org/wasm/doc/trunk/persistence.md
- [MDN-COEP] https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cross-Origin-Embedder-Policy

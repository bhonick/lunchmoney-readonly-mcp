# Read-only Lunch Money MCP for ChatGPT

A single-user remote MCP server for Lunch Money, designed for ChatGPT Business
and deployed on Cloudflare Workers. It uses Google OAuth only to identify an
allowlisted user; the Lunch Money API token is stored as a Cloudflare encrypted
secret and is never returned to ChatGPT or an MCP tool.

This repository is a template. It contains no live deployment URL, API token,
Google OAuth secret, email address, or Cloudflare resource ID.

## What makes it read-only

The server enforces read-only access in two independent layers:

1. `createReadonlyServer()` exposes a positive allowlist of 25 retrieval tools.
   Create, update, delete, upload, sync, refresh, split, grouping, and budget
   mutation tools are not registered.
2. `runWithReadonlyConfig()` rejects any non-`GET` request to the Lunch Money
   API before a network request is made.

All exposed tools declare `readOnlyHint: true`, `destructiveHint: false`, and
`openWorldHint: false`.

## Requirements

- A Lunch Money API token
- A Cloudflare account with Workers and KV available
- A Google Cloud OAuth 2.0 web client
- A ChatGPT Business workspace where you are an admin or owner

## Deploy your own copy

1. Clone this repository, then install and verify dependencies:

   ```text
   npm install
   npm run typecheck
   npm run lint
   npm run test:readonly
   ```

2. In `wrangler.jsonc`, choose a unique Worker `name` and create the OAuth KV
   namespace:

   ```text
   npx wrangler kv namespace create OAUTH_KV
   ```

   Copy the returned namespace ID into
   `REPLACE_WITH_OAUTH_KV_NAMESPACE_ID` in `wrangler.jsonc`.

3. Deploy once to obtain your Worker URL:

   ```text
   npx wrangler deploy
   ```

4. Create a Google OAuth 2.0 **Web application**. Add this redirect URI,
   replacing the host with your Worker URL:

   ```text
   https://YOUR-WORKER.YOUR-SUBDOMAIN.workers.dev/authorize/callback
   ```

5. Set the production secrets interactively. Never put their values in Git:

   ```text
   npx wrangler secret put GOOGLE_CLIENT_ID
   npx wrangler secret put GOOGLE_CLIENT_SECRET
   npx wrangler secret put ALLOWED_EMAILS
   npx wrangler secret put STATE_SECRET
   npx wrangler secret put LUNCHMONEY_API_TOKEN
   ```

   `ALLOWED_EMAILS` is a comma-separated list of Google accounts allowed to
   connect. The server fails closed when this is empty.

6. Deploy again. Your MCP endpoint is:

   ```text
   https://YOUR-WORKER.YOUR-SUBDOMAIN.workers.dev/mcp
   ```

## Connect ChatGPT Business

1. In ChatGPT, open **Workspace settings → Apps → Create**.
2. Enter the `/mcp` endpoint above and choose **OAuth** authentication.
3. Review the custom-app warning, create the draft, then publish and enable it.
4. Each user connects from **Settings → Plugins → [your app] → Connect** and
   signs in with an allowlisted Google account.
5. Start a fresh Work chat, select the app, and verify the tool list before
   asking it to inspect Lunch Money data.

## Before making the repository public

Run:

```text
npm run check:public-release
```

Also review `git status`, confirm `.dev.vars` is untracked, and ensure the
Worker name, endpoint, Cloudflare resource IDs, and example documentation do
not identify your personal deployment.

If you are sanitizing an existing deployment, keep its configuration outside
the repository or in a gitignored `wrangler.personal.jsonc` file. Deploy that
private configuration with `npx wrangler deploy --config wrangler.personal.jsonc`.

## Verification

The focused security test verifies the exact allowlist, its annotations, the
absence of representative mutation tools, and rejection of outbound POST
requests:

```text
npm run test:readonly
```

See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for attribution details.

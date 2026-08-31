# Read-only Lunch Money MCP for ChatGPT

A single-user remote MCP server for Lunch Money, designed for ChatGPT Business
and deployed on Cloudflare Workers. It uses Google OAuth only to identify an
allowlisted user; the Lunch Money API token is stored as a Cloudflare encrypted
secret and is never returned to ChatGPT or an MCP tool.

This project was originally based on the bm1549/lunchmoney-mcp-cloudflare
project and has been adapted into a read-only Lunch Money MCP template for
Cloudflare Workers and ChatGPT. The bundled upstream implementation is retained
under `vendor-lunchmoney-mcp`, including its original MIT license and
attribution. Thanks to Brian Marks for the original work.

This repository is a template. It contains no live deployment URL, API token,
Google OAuth secret, email address, or Cloudflare resource ID.

## Default security model

The default Worker remains strictly read-only and enforces that boundary in two
independent layers:

1. `createReadonlyServer()` exposes a positive allowlist of 25 retrieval tools.
   Create, update, delete, upload, sync, refresh, split, grouping, and budget
   mutation tools are not registered.
2. `runWithReadonlyConfig()` rejects any non-`GET` request to the Lunch Money
   API before a network request is made.

All retrieval tools declare `readOnlyHint: true`, `destructiveHint: false`, and
`openWorldHint: false`.

The optional categorization mode described below does **not** replace or weaken
the default deployment. If `ACCESS_MODE` is absent, the Worker is read-only.

## Optional category-only sibling Worker

For workflows where an assistant should help categorize transactions without
receiving general write access, the same code can be deployed as a second
Worker with:

```text
ACCESS_MODE=categorize
```

That mode adds exactly one mutation tool:

```text
categorize_transaction(transaction_id, category_id)
```

The category-only server has two independent safety layers:

1. Its MCP surface is a positive allowlist containing the same 25 retrieval
   tools plus only `categorize_transaction`.
2. Its API policy permits `GET`, plus a `PUT` to `/transactions/{numeric-id}`
   only when the JSON body contains exactly one key: `category_id`. All other
   `POST`, `PUT`, `DELETE`, and upload requests are rejected before `fetch`.

`category_id` may be a positive integer or `null` to remove a category. The
categorization tool cannot change amount, date, payee, notes, tags, account,
status, recurring linkage, metadata, splits, groups, or attachments.

### Why use a sibling Worker?

Keeping two endpoints makes the trust boundary obvious:

- your existing endpoint stays strictly read-only;
- the second endpoint is connected only when you intentionally want
  categorization assistance;
- a configuration mistake in the categorization deployment does not silently
  convert the read-only endpoint into a writer.

## Requirements

- A Lunch Money API token
- A Cloudflare account with Workers and KV available
- A Google Cloud OAuth 2.0 web client
- A ChatGPT workspace that supports custom MCP apps

## Install and verify

This repository tracks `pnpm-lock.yaml`, so use pnpm:

```text
corepack enable
corepack prepare pnpm@10.15.0 --activate
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm run lint
pnpm test
```

Focused access-boundary tests are also available:

```text
pnpm run test:readonly
pnpm run test:categorize
```

## Deploy the read-only Worker

1. In `wrangler.jsonc`, choose a unique Worker `name` and create the OAuth KV
   namespace:

   ```text
   pnpm exec wrangler kv namespace create OAUTH_KV
   ```

   Copy the returned namespace ID into
   `REPLACE_WITH_OAUTH_KV_NAMESPACE_ID` in `wrangler.jsonc`.

2. Deploy once to obtain your Worker URL:

   ```text
   pnpm exec wrangler deploy
   ```

3. Create a Google OAuth 2.0 **Web application**. Add this redirect URI,
   replacing the host with your Worker URL:

   ```text
   https://YOUR-WORKER.YOUR-SUBDOMAIN.workers.dev/authorize/callback
   ```

4. Set the production secrets interactively. Never put their values in Git:

   ```text
   pnpm exec wrangler secret put GOOGLE_CLIENT_ID
   pnpm exec wrangler secret put GOOGLE_CLIENT_SECRET
   pnpm exec wrangler secret put ALLOWED_EMAILS
   pnpm exec wrangler secret put STATE_SECRET
   pnpm exec wrangler secret put LUNCHMONEY_API_TOKEN
   ```

5. Deploy again. Your MCP endpoint is:

   ```text
   https://YOUR-WORKER.YOUR-SUBDOMAIN.workers.dev/mcp
   ```

## Deploy the category-only sibling

Do not put personal Worker names, account IDs, KV IDs, or deployment URLs in
the public repository. Keep the sibling configuration in the gitignored
`wrangler.categorize.personal.jsonc`.

A practical setup is:

1. Copy your private read-only deployment configuration to
   `wrangler.categorize.personal.jsonc`.
2. Give it a different Worker `name`.
3. Add:

   ```json
   "vars": {
       "ACCESS_MODE": "categorize"
   }
   ```

4. Prefer a separate OAuth KV namespace for the sibling so its OAuth grants are
   isolated from the read-only Worker.
5. Add the sibling Worker's `/authorize/callback` URL to the Google OAuth web
   client, or create a separate OAuth client if you want stronger separation.
6. Set the same required secrets against the sibling configuration:

   ```text
   pnpm exec wrangler secret put GOOGLE_CLIENT_ID --config wrangler.categorize.personal.jsonc
   pnpm exec wrangler secret put GOOGLE_CLIENT_SECRET --config wrangler.categorize.personal.jsonc
   pnpm exec wrangler secret put ALLOWED_EMAILS --config wrangler.categorize.personal.jsonc
   pnpm exec wrangler secret put STATE_SECRET --config wrangler.categorize.personal.jsonc
   pnpm exec wrangler secret put LUNCHMONEY_API_TOKEN --config wrangler.categorize.personal.jsonc
   ```

7. Deploy it:

   ```text
   pnpm exec wrangler deploy --config wrangler.categorize.personal.jsonc
   ```

Connect the read-only and category-only endpoints as separate ChatGPT apps so
you can tell which capability is active.

## Connect ChatGPT

1. In ChatGPT, create a custom app using the Worker's `/mcp` endpoint and
   choose OAuth authentication.
2. Review the custom-app warning, create the draft, then publish and enable it.
3. Connect with an allowlisted Google account.
4. Start a fresh chat with the app enabled and verify the tool list before
   asking it to inspect or categorize Lunch Money data.

## Before making the repository public

Run:

```text
pnpm run check:public-release
```

Also review `git status`, confirm `.dev.vars` and both personal Wrangler config
files are untracked, and ensure the Worker name, endpoint, Cloudflare resource
IDs, and example documentation do not identify your personal deployment.

## Verification

The access tests verify:

- the exact strict read-only tool allowlist;
- the exact category-only tool allowlist;
- annotations for read and category-write tools;
- absence of representative broader mutation tools;
- rejection of arbitrary writes before network access; and
- successful passage of only the exact category-only transaction `PUT`.

See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for attribution details.

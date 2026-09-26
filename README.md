# CS2 Boost

First version of a bilingual CS2 service site for Premier and FACEIT requests.

## Included

- Public RU/EN landing page and request configurator.
- Email/password registration after configuration.
- Client and admin order lists.
- Admin quote in KZT with a completion date; client quote acceptance.
- Manual status updates and per-order chat.
- Risk acknowledgement stored with each request.

The configurator collects parameters but does not calculate an automatic price or deadline until tariffs are defined. Payment integration, email verification, and Steam credential handling are not part of this version. The site must remain private while those and business terms are reviewed.

## Development

The Site uses Vinext, Cloudflare D1, and Drizzle. Its D1 binding is declared as `DB` in `.openai/hosting.json`.

1. Install dependencies with `npm ci`.
2. Generate migrations after schema edits with `npm run db:generate`.
3. Run `npm run build` once to create the local Wrangler config.
4. Apply pending migrations with `node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_cynical_joshua_kane.sql`.
5. Start `npm run dev`.
6. Run `node scripts/smoke.mjs` against the local server to check the order flow.

The first registered account becomes admin only if the hosting layer supplies an authenticated Site user ID. Create that account while the published Site is still owner-private, before opening registration to clients. Every subsequent account is a client. Do not change access to public before this step.

The site does not request or store Steam passwords or Steam Guard codes. The order form and chat both warn against sending them.

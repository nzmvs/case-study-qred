# Notes: what I would do with more time

What was cut to keep the case to its scope, what is knowingly simplified, and where each piece would go next. Decisions already taken are in [docs/adr](docs/adr); terms are in [CONTEXT.md](CONTEXT.md).

## Known simplifications

These are deliberate and visible in the running system.

- **Authentication is mocked.** Bearer tokens are demo principal names resolved from configuration ([ADR 0003](docs/adr/0003-membership-in-access-token.md)). The domain checks behind them (Membership, own Card only, the processor scope) are real.
- **Anyone who can see a Card can change its Spending limit.** There are no roles yet.
- **Spend periods are UTC calendar months** ([ADR 0005](docs/adr/0005-spend-periods-are-utc-months.md)), so a purchase in the first hour or two of a local month counts towards the previous one.
- **Expiry is derived on read.** Nothing stores `expired`, so SQL cannot filter on it and the one-open-Card rule is only enforced for `closed`.
- **Feature flags switch per User only**, never per Company, because a Card change cannot know its Company before choosing a source.
- **Invoices are seed data.** Nothing generates or pays them.
- **The demo harness is a dev tool** (`apps/demo`), not a client. The "more items in transaction view" link has no Screen behind it.

## Domain

- **Roles on Membership.** Admin and Member, with only Admins setting Spending limits, and optionally a per-Card ceiling below which Members adjust their own limit.
- **Company Credit limit.** Card limits can overcommit the Company's credit. Remaining spend would become the lower of the Card's and the Company's, with a `limitedBy` field so the Screen can say "based on company credit" instead of "your set limit".
- **Card issuing and Replacement.** `POST /cards`, with `last4` and expiry from the Card processor, and a Replacement flow for lost, stolen and expired Cards.
- **A nightly expiry job** that persists `expired` as a status. Reads keep deriving it for exactness, but queries and a proper "one Card that is neither closed nor expired" index become possible.
- **Transaction lifecycle.** The processor settling and reversing Transactions (`PUT /transactions/{id}`), and idempotency keys on `POST` so a retried authorisation is not recorded twice.
- **Transitions as resources** (`POST /cards/{id}/activations`) once transitions need their own input or an audit trail ([ADR 0002](docs/adr/0002-put-with-if-match-no-patch.md) names this as the upgrade path). A Card event history comes with it.
- **Several Cards per Cardholder per Company.** The Screen would carry `cards[]`, added next to the current endpoint so nothing breaks.
- **Invoices generated from Transactions**, paid through a payment provider, with `paid` as a real transition.
- **Local-time Spend periods** once Company time zones are replicated into the Card API (see Integration).

## Integration between services

- **Identity events.** `MembershipGranted`, `MembershipRevoked` and `CompanyUpdated` published by the Identity API and projected locally by the Card and Billing APIs, through an outbox so no event is lost. This removes the token-lifetime staleness from ADR 0003 and gives the Card API Company time zones for local Spend periods.
- **Transaction events.** `TransactionRecorded` and `TransactionSettled` feeding Billing, so Invoices follow spend.
- **Real authentication.** An OIDC provider with the authorisation code flow and PKCE for the app, client credentials for the processor, JWT verification in `packages/service-kit/src/auth.ts` (the only file that changes), and key rotation through JWKS.

## App BFF and contracts

- **The Transactions Screen** behind "54 more items": `GET /screens/transactions?cardId&cursor`, contract first, on top of the Card API's existing cursor pagination.
- **`GET /me/companies`** once a second Screen needs the Company switcher.
- **Per-Company flag rollout.** The Card change would need the Company in its request (or a lookup first) so reads and writes always route to the same source.
- **Resilience per upstream.** Timeouts tuned per upstream, and a circuit breaker so a failing upstream is not called on every request.
- **Conditional GET on Screens.** `@fastify/etag` in the App BFF would give each Screen an ETag and answer `304` when the app already has it, saving mobile bandwidth.
- **Effect in the App BFF.** Composing upstreams with timeouts and partial failure is what Effect is built for; worth trying there if that logic grows.
- **Card numbers.** Showing the full number or CVV belongs in the Card processor's secure view (PCI DSS), so it never passes through Qred's backend.
- **Flag hygiene.** Each `bff-*-api-real` flag is removed from code once its service is live for everyone.

## Testing

- **Integration tests in code.** The smoke scenario as `node:test` tests with `app.inject` against Postgres, each run in its own throwaway schema, including the concurrent-purchase case.
- **Query plans under load.** A bulk seed (about 100 000 Transactions across many Cards) and `EXPLAIN ANALYZE` showing the spend query as an index-only scan, then a load test of the Screen.
- **CI.** Contract lint, unit tests, contract tests against the compose stack, and breaking-change detection on every contract change (for example `oasdiff`), with CODEOWNERS per contract so the owning team reviews it.
- **Consumer checks.** The mobile app's expectations of the App BFF expressed as consumer-driven contract tests.

## Production

- **Deployment.** Each service as its own container (ECS or Kubernetes), Postgres per service on RDS, migrations as a pipeline step, secrets from a secrets manager, and Unleash run as a managed or production instance with proper API tokens instead of an admin session.
- **Observability.** OpenTelemetry traces across the App BFF and its upstreams, metrics per endpoint and upstream, and the existing structured logs shipped centrally.
- **Edge concerns.** Rate limiting, request size limits and security headers at the gateway; CORS only where a browser client needs it.

## Tooling observations

- The hand-written migrate, seed and reset CLI (`packages/service-kit/src/db-cli.ts`) could give way to `kysely-ctl`, Kysely's own CLI for migrations and seeds.

- The official `stoplight/prism` image crashes on startup, so the mocks run the Prism npm package (`infra/prism`).
- The Prism mocks answer a missing `If-Match` with a generic validation error (`400` for the App BFF, `422` for the Card API); the real services answer `428` as the contracts say.
- Redocly reports the Card API's `PUT` example as not matching the `closedReason` `if`/`else` rule. Ajv, which validates at runtime, accepts it.

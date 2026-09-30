# Qred Card

Backend for the card overview screen of the Qred mobile app: the selected Company, the User's Card, Remaining spend against the Spending limit, the latest Transactions and the next Invoice due. Built contract-first: every API has an OpenAPI contract, a mock generated from it, and an implementation whose routes and validation come from that same contract.

## Run it

Requires Docker. Host-side scripts use Node 24, pnpm 10 and Python 3.9+ (the test runners).

```sh
pnpm start          # build and start the stack, wait until healthy
pnpm dev            # same, in the foreground with hot reload
pnpm down           # stop everything
```

Without pnpm on the host: `docker compose -f infra/docker-compose.yml up --build`.

Then ask the App BFF for the screen. Every request acts as the demo User Anna ([ADR 0006](docs/adr/0006-fixed-demo-user.md)):

```sh
curl localhost:3000/screens/card-overview
```

Or open the demo harness at [localhost:3100](http://localhost:3100): a dev-only page that renders the Screen, switches each upstream between mock and real, activates or freezes the Card, and simulates purchases as the Card processor.

A fresh stack serves every upstream from its contract mock. Open Unleash at [localhost:4242](http://localhost:4242) (`admin` / `unleash4all`) and turn on `bff-identity-api-real`, `bff-card-api-real` or `bff-billing-api-real` to switch that upstream to the real service. The response header `Qred-Data-Sources` shows which served it ([ADR 0004](docs/adr/0004-flagged-upstream-sources-in-bff.md)).

The Card API mock answers every Company with the same example Card and keeps no changes, so turn on `bff-card-api-real` before activating, freezing or simulating purchases. Demo data is seeded relative to the current date whenever a service starts, and Remaining spend counts the current UTC month: after a month boundary, run `pnpm db:reset`.

## Where the case lives

| The case asks for | Where it is |
|---|---|
| Database schema | `apps/*/src/db/migrations/`: one Postgres database per service |
| Payload response for the screen | [contracts/app-bff.yaml](contracts/app-bff.yaml): `GET /screens/card-overview` returns the whole screen in one payload |
| How both are optimised for the frontend and the backend | [Schema and payload design](#schema-and-payload-design) below |
| API structure | the App BFF over three domain services, each with its own contract ([ADR 0001](docs/adr/0001-card-api-and-bff-split.md)) |
| Code implementation | `apps/` and `packages/service-kit/`, described below |
| Notes on further work | [NOTES.md](NOTES.md) |

## Schema and payload design

**The payload is shaped for the view.** `GET /screens/card-overview` returns everything the view renders, so the app needs one round trip at launch, and `PUT /cards/{cardId}` answers with the refreshed Screen, so a change needs no second call.

- Remaining spend comes with its limit and Spend period, ready for "5 400/10 000 kr". The Card API computes it, so neither the BFF nor the app repeats the rule.
- The Card comes as printed (`last4`, `expiry` as MM/YY, `holderName`), with the `etag` to send as `If-Match` and the `actions` the User can take now, each with the `status` to send. The app never needs the Card lifecycle.
- The three latest Transactions come with `moreCount` for "54 more items", and the next Invoice due comes as one object or `null`.
- Money is minor units with its currency; the app formats it.
- An optional section whose upstream fails is `null` and listed in `unavailable`, so the Screen still renders and the app can tell "loading" from "none".

**The BFF waits on as few round trips as the data allows.** After `/me`, the Invoice lookup runs while the Card is found; the Card, its spend and its Transactions then load in parallel. Every upstream call has a timeout (1 s by default).

**Every query behind the Screen uses an index.** Each service has its own Postgres database.

| Query | Index | Plan |
|---|---|---|
| the User's Card in a Company | `cards (company_id, holder_user_id, created_at)` | index scan, no sort |
| spend in the Spend period | `transactions (card_id, occurred_at, id) INCLUDE (amount, status)` | index-only scan |
| latest Transactions, paged on `(occurred_at, id)` | the same index | index scan, no sort |
| next Invoice due | `invoices (company_id, due_date)` | index scan |

The plans are from `EXPLAIN` on the seed data with sequential scans disabled, since the demo tables fit in one page; confirming them at volume is in [NOTES.md](NOTES.md). The rest of the schema keeps rules in Postgres and state exact:

- Money is `bigint` minor units, statuses are `text` with `CHECK` constraints, and a partial unique index allows one open Card per Cardholder and Company.
- `expired` and `overdue` are derived on read from `expires_at` and `due_at`, so they are exact without a background job.
- Recording a Transaction locks its Card row, so concurrent Transactions cannot jointly exceed the Spending limit.

## Stack

Node 24 and TypeScript, Fastify 5 with routes and validation from the OpenAPI contracts (`fastify-openapi-glue`, Ajv), Postgres 18 with Kysely and `kysely-ctl`, Unleash for feature flags, Prism for contract mocks, Schemathesis for contract tests, pnpm workspaces with Turborepo, Docker Compose for the stack.

## External dependencies

**Runtime, in the service kit** (`packages/service-kit`, so every service gets them):

| Package | Used for |
|---|---|
| `fastify` | HTTP server for every service |
| `fastify-openapi-glue` | builds each service's routes from its OpenAPI contract, one handler per `operationId` |
| `ajv`, `ajv-formats` | validates requests against the contract: coercing for query, path and headers, exact for bodies |
| `qs` | parses query strings, including comma-separated arrays (`?status=active,frozen`) |
| `@fastify/sensible` | HTTP error constructors (`httpErrors.notFound()` and so on), serialised as problem+json by the kit |
| `fastify-plugin` | lets the kit's plugins (`problemJson`, `demoIdentity`, `contract`) apply to the whole app |
| `env-schema` | validates each service's environment variables against a JSON schema at startup |
| `kysely`, `pg` | type-safe SQL query builder over the Postgres driver |
| `kysely-ctl` | runs migrations and seeds (also a dev dependency of each domain service, for its `kysely` command) |

**Runtime, per service:**

| Package | Service | Used for |
|---|---|---|
| `canonicalize` | Card API | canonical JSON (RFC 8785) of a Card, hashed into its ETag |
| `openapi-fetch` | App BFF | typed HTTP clients for the Identity, Card and Billing APIs |
| `unleash-client` | App BFF | reads the feature flags that pick mock or real per upstream |
| `@fastify/reply-from` | demo harness | proxies the demo page's calls to the App BFF |

**Development:**

| Package | Used for |
|---|---|
| `typescript`, `@types/*` | type checking; the services run TypeScript directly through `tsx` in development |
| `tsx` | runs and hot-reloads the TypeScript sources |
| `openapi-typescript` | generates each app's TypeScript types from the contracts (`pnpm gen`) |
| `kysely-codegen` | generates the database types from the migrated schema |
| `turbo` | runs `build`, `typecheck`, `test` and `gen` across the workspace, cached |

**Containers and tools outside `package.json`:**

| Image or tool | Used for |
|---|---|
| `node:24-alpine` | base image for every service (`infra/Dockerfile`) |
| `postgres:18-alpine` | the database server, one database per service |
| `unleashorg/unleash-server:8.2` | the feature flag server and its UI at `localhost:4242` |
| `@stoplight/prism-cli` | contract mocks, installed into `infra/prism` (the official Prism image fails to start) |
| `python:3.13-alpine` | runs the Unleash flag seeder (`infra/unleash/seed.py`) |
| `schemathesis/schemathesis` | contract tests (`pnpm test:contract`), run in Docker |
| `@redocly/cli` | contract linting (`pnpm lint:contracts`), fetched on demand with `pnpm dlx` |

## Services

| Service | Port | Contract | What it owns |
|---|---|---|---|
| App BFF | 3000 | [app-bff.yaml](contracts/app-bff.yaml) | Screens for the mobile app, composed from the services below |
| Identity API | 3001 | [identity-api.yaml](contracts/identity-api.yaml) | Users, Companies, Memberships |
| Card API | 3002 | [card-api.yaml](contracts/card-api.yaml) | Cards, their lifecycle, Transactions, spend |
| Billing API | 3003 | [billing-api.yaml](contracts/billing-api.yaml) | Invoices |
| Contract mocks | 4001-4003 | same contracts | Prism mocks of Identity, Card and Billing |
| App BFF mock | 4000 | app-bff.yaml | For frontend work before the BFF exists: `pnpm compose --profile mock up` |
| Demo harness | 3100 | | Dev-only page: the Screen, flag switches, simulated purchases |
| Unleash | 4242 | | Feature flags for the BFF's upstream sources |
| Postgres | internal | | One database per service |

## Project structure

```
apps/
  app-bff/          Screen assembly, upstream clients, mock/real routing
  identity-api/     \
  card-api/          > domain services: handlers, domain rules, migrations, seed
  billing-api/      /
  demo/             dev-only demo harness: one static page and a small server
packages/
  service-kit/      createService() plus the request pipeline as plugins: problemJson, demoIdentity, contract
contracts/          OpenAPI contracts, the source of truth for routes, validation and types
infra/              Dockerfile, docker-compose.yml, Postgres init, Prism image, Unleash seed
tests/contract/     Schemathesis configuration per service
scripts/            contract and smoke test runners (Python 3.9+, standard library only)
docs/adr/           architecture decisions
CONTEXT.md          domain glossary
NOTES.md            known simplifications and further work
turbo.json          workspace tasks: build, typecheck, test, gen
```

## How a service is structured

Every domain service has the same shape; the Card API as an example:

```
apps/card-api/
  src/
    server.ts          config, database, the request pipeline, listen
    handlers.ts        one function per operationId in contracts/card-api.yaml
    domain/            pure rules with unit tests: card lifecycle, spend period, spending limit, statuses
    cards/             the Card representation served by the API and its ETag
    problems.ts        the service's own error types as problem+json
    db/
      migrations/      schema changes, run by kysely-ctl
      seeds/demo.ts    demo data, reset on every start
      types.ts         generated from the migrated database (kysely-codegen)
    generated/         TypeScript types generated from the contract (pnpm gen)
  kysely.config.ts     kysely-ctl setup, shared from the service kit
```

`server.ts` reads as the request pipeline, in the order the plugins apply:

```ts
const app = createService();                                   // query parsing, validators, JSON bodies, /health
await app.register(problemJson, { mapError: mapCardError });   // every error leaves as RFC 9457 problem+json
await app.register(demoIdentity, { userId: config.DEMO_USER_ID }); // request.userId: the demo User (ADR 0006)
await app.register(contract, { path: contractPath("card-api"), handlers: cardHandlers({ db }) });
```

A request goes through them like this:

1. `demoIdentity` sets `request.userId`.
2. `contract` matches the route from the OpenAPI file and validates path, query, headers and body against it. Anything the contract does not allow is `400` (or `405`, `415`, `428`) before a handler runs.
3. The handler named after the `operationId` does the work, calling the pure `domain/` functions and Kysely.
4. The response is serialised against the contract's response schema.
5. Any thrown error, and any request for an unknown route, is turned into problem+json by `problemJson`.

Adding an endpoint follows the same order: write it in the contract, run `pnpm gen`, add a handler with the operation's `operationId`, then `pnpm test:contract` checks the result against the contract.

The App BFF has the same pipeline but no database: `upstreams.ts` holds typed clients for the three domain services, `sources.ts` decides per upstream whether the mock or the real service answers (ADR 0004), and `screen.ts` shapes their data into the Screen.

## Scripts

| Script | Does |
|---|---|
| `pnpm test` | unit tests in every package |
| `pnpm typecheck` | TypeScript across the workspace |
| `pnpm build` | compiles every package in dependency order |
| `pnpm test:contract` | Schemathesis generates requests against each running service and checks every response against its contract |
| `pnpm test:smoke` | Card API behaviour: ETags, the card lifecycle, the Spending limit |
| `pnpm lint:contracts` | lints the OpenAPI contracts |
| `pnpm gen` | regenerates TypeScript types from the contracts |
| `pnpm db:reset` | reseeds the demo data (migrations and seeds run through `kysely-ctl`) |
| `pnpm logs` | follows the stack's logs |
| `pnpm compose ...` | any other `docker compose` command for this stack |

`test`, `typecheck`, `build` and `gen` run through Turborepo and are cached: a repeat run with no changes finishes in milliseconds. The contract and smoke tests run against the running stack (`pnpm start` first); they change data and reseed afterwards. In the dev stack, starting or restarting a service also reseeds its demo data.

## Further reading

- [CONTEXT.md](CONTEXT.md): the domain language used in code, contracts and docs
- [NOTES.md](NOTES.md): known simplifications and what I would do with more time
- [docs/slides/index.html](docs/slides/index.html): the presentation for both tasks; open it in a browser (arrow keys to move, `n` for notes, `f` for fullscreen)
- [docs/adr](docs/adr): why the services are split, why PUT with If-Match, the fixed demo User, feature-flagged upstreams, UTC spend periods

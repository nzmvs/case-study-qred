# Qred Card

Backend for the card overview screen of the Qred mobile app: the selected Company, the User's Card, Remaining spend against the Spending limit, the latest Transactions and the next Invoice due. Built contract-first: every API has an OpenAPI contract, a mock generated from it, and an implementation whose routes and validation come from that same contract.

## Run it

Requires Docker. Host-side scripts use Node 24 and pnpm 10.

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
  service-kit/      shared plumbing: contract-driven Fastify, demo identity, problem+json, Kysely
contracts/          OpenAPI contracts, the source of truth for routes, validation and types
infra/              Dockerfile, docker-compose.yml, Postgres init, Prism image, Unleash seed
tests/contract/     Schemathesis configuration per service
scripts/            contract and smoke test runners (Python 3.9+, standard library only)
docs/adr/           architecture decisions
CONTEXT.md          domain glossary
```

## Scripts

| Script | Does |
|---|---|
| `pnpm test` | unit tests in every package |
| `pnpm typecheck` | TypeScript across the workspace |
| `pnpm test:contract` | Schemathesis generates requests against each running service and checks every response against its contract |
| `pnpm test:smoke` | Card API behaviour: ETags, the card lifecycle, the Spending limit |
| `pnpm lint:contracts` | lints the OpenAPI contracts |
| `pnpm gen` | regenerates TypeScript types from the contracts |
| `pnpm db:reset` | reseeds the demo data (migrations and seeds run through `kysely-ctl`) |
| `pnpm logs` | follows the stack's logs |
| `pnpm compose ...` | any other `docker compose` command for this stack |

The contract and smoke tests change data and reseed afterwards. Starting or restarting a service also reseeds its demo data.

## Further reading

- [CONTEXT.md](CONTEXT.md): the domain language used in code, contracts and docs
- [NOTES.md](NOTES.md): known simplifications and what I would do with more time
- [docs/adr](docs/adr): why the services are split, why PUT with If-Match, the fixed demo User, feature-flagged upstreams, UTC spend periods

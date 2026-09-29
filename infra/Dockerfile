FROM node:24-alpine AS base
RUN corepack enable
WORKDIR /repo

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/identity-api/package.json apps/identity-api/
COPY apps/card-api/package.json apps/card-api/
COPY apps/billing-api/package.json apps/billing-api/
COPY apps/app-bff/package.json apps/app-bff/
COPY apps/demo/package.json apps/demo/
COPY packages/service-kit/package.json packages/service-kit/
RUN pnpm install --frozen-lockfile

FROM deps AS dev
ARG APP
ENV APP=${APP}
COPY . .
CMD ["sh", "-c", "pnpm --filter @qred/${APP} dev"]

FROM deps AS build
ARG APP
COPY . .
RUN pnpm --filter "@qred/${APP}..." build \
 && pnpm --filter @qred/${APP} deploy --prod --legacy /out

FROM node:24-alpine AS prod
ARG APP
WORKDIR /app
COPY --from=build /out .
# Routes and validation are built from the contract at startup.
COPY contracts/${APP}.yaml /app/contract.yaml
ENV CONTRACT_PATH=/app/contract.yaml
USER node
CMD ["node", "dist/server.js"]

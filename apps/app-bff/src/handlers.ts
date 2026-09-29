import { notFound, Unauthenticated } from "@qred/service-kit";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { operations } from "./generated/app-bff.js";
import { assembleCardOverview, type CardOverviewScreen, currentSpendPeriod } from "./screen.js";
import { describeSources, type Routing, route } from "./sources.js";
import { badGateway, forwardProblem, optional, required, type Upstreams } from "./upstreams.js";

type ScreenQuery = NonNullable<operations["getCardOverviewScreen"]["parameters"]["query"]>;
type PutCardPath = operations["putCard"]["parameters"]["path"];
type PutCardHeaders = operations["putCard"]["parameters"]["header"];
type PutCardBody = operations["putCard"]["requestBody"]["content"]["application/json"];

export type Clock = () => Date;

const OPEN_CARD_STATUSES = ["inactive", "active", "frozen"] as const;
const DUE_INVOICE_STATUSES = ["open", "overdue"] as const;
const FORWARDED_CARD_ERRORS = new Set([404, 409, 412]);

function userIdOf(request: FastifyRequest): string {
  if (request.principal.kind !== "user") throw new Unauthenticated("The App BFF serves Users only.");
  return request.principal.userId;
}

export function bffHandlers({ routing, clock, timeoutMs }: { routing: Routing; clock: Clock; timeoutMs: number }) {
  /** Routes this request's upstreams and, where mocks are allowed, tells the client which served it. */
  function routeFor(request: FastifyRequest, reply: FastifyReply): Upstreams {
    const { upstreams, sources } = route(routing, userIdOf(request));
    if (routing.mock) reply.header("Qred-Data-Sources", describeSources(sources));
    return upstreams;
  }

  async function loadCardOverview(
    { identity, card, billing }: Upstreams,
    authorization: string,
    companyId: string | undefined,
  ): Promise<CardOverviewScreen> {
    const call = () => ({ headers: { authorization }, signal: AbortSignal.timeout(timeoutMs) });

    const { data: me } = await required("Identity API", identity.GET("/me", call()));
    const selectedCompanyId = companyId ?? me.companies[0]?.id;
    if (!selectedCompanyId || !me.companies.some((c) => c.id === selectedCompanyId)) {
      throw notFound("The Company does not exist or the User is not a member of it.");
    }

    // Independent of the Card, so it runs while the Card is being found.
    const invoices = optional(
      billing.GET("/invoices", {
        params: { query: { companyId: selectedCompanyId, status: [...DUE_INVOICE_STATUSES], limit: 1 } },
        ...call(),
      }),
    );

    const { data: found } = await required(
      "Card API",
      card.GET("/cards", {
        params: { query: { companyId: selectedCompanyId, holder: "me", status: [...OPEN_CARD_STATUSES] } },
        ...call(),
      }),
    );
    const cardId = found.items[0]?.id;
    const period = currentSpendPeriod(clock());

    if (!cardId) {
      return assembleCardOverview({ me, selectedCompanyId, card: null, spend: null, transactions: null, invoices: await invoices, period });
    }

    const path = { path: { cardId } };
    const [cardResult, spend, transactions] = await Promise.all([
      required("Card API", card.GET("/cards/{cardId}", { params: path, ...call() })),
      optional(
        card.GET("/cards/{cardId}/spend", {
          params: { ...path, query: { from: period.start.toISOString(), to: period.end.toISOString() } },
          ...call(),
        }),
      ),
      optional(card.GET("/cards/{cardId}/transactions", { params: { ...path, query: { limit: 3 } }, ...call() })),
    ]);
    const etag = cardResult.response.headers.get("etag");
    if (!etag) throw badGateway("Card API answered without an ETag.");

    return assembleCardOverview({
      me,
      selectedCompanyId,
      card: { card: cardResult.data, etag },
      spend,
      transactions,
      invoices: await invoices,
      period,
    });
  }

  return {
    async getCardOverviewScreen(request: FastifyRequest<{ Querystring: ScreenQuery }>, reply: FastifyReply) {
      return loadCardOverview(routeFor(request, reply), request.headers.authorization!, request.query.companyId);
    },

    async putCard(request: FastifyRequest<{ Params: PutCardPath; Headers: PutCardHeaders; Body: PutCardBody }>, reply: FastifyReply) {
      const upstreams = routeFor(request, reply);
      const { card } = upstreams;
      const authorization = request.headers.authorization!;
      const call = () => ({ headers: { authorization }, signal: AbortSignal.timeout(timeoutMs) });
      const path = { path: { cardId: request.params.cardId } };

      const current = await card.GET("/cards/{cardId}", { params: path, ...call() }).catch(() => undefined);
      if (current?.response.status === 404) throw forwardProblem(404, current.error);
      if (!current?.data) throw badGateway("Card API did not answer.");

      // Full representation (ADR 0002): the Screen changes only the status; settings are sent back as read.
      // The client's If-Match still guards them, so a concurrent change to the limit fails with 412.
      const updated = await card
        .PUT("/cards/{cardId}", {
          params: { ...path, header: { "If-Match": request.headers["if-match"] } },
          body: { settings: current.data.settings, state: { status: request.body.status, closedReason: null } },
          ...call(),
        })
        .catch(() => undefined);
      if (!updated) throw badGateway("Card API did not answer.");
      if (FORWARDED_CARD_ERRORS.has(updated.response.status)) throw forwardProblem(updated.response.status, updated.error);
      if (!updated.response.ok) throw badGateway(`Card API answered ${updated.response.status}.`);

      return loadCardOverview(upstreams, authorization, current.data.details.companyId);
    },
  };
}

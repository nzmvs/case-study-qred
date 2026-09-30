import { httpErrors } from "@qred/service-kit";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { operations } from "./generated/app-bff.js";
import { assembleCardOverview, type CardOverviewScreen, LATEST_TRANSACTIONS } from "./screen.js";
import { describeSources, type Routing, route } from "./sources.js";
import { badGateway, optional, required, type Upstreams } from "./upstreams.js";

type ScreenQuery = NonNullable<operations["getCardOverviewScreen"]["parameters"]["query"]>;
type PutCardPath = operations["putCard"]["parameters"]["path"];
type PutCardHeaders = operations["putCard"]["parameters"]["header"];
type PutCardBody = operations["putCard"]["requestBody"]["content"]["application/json"];

const OPEN_CARD_STATUSES = ["inactive", "active", "frozen"] as const;
const DUE_INVOICE_STATUSES = ["open", "overdue"] as const;
const CARD_NOT_FOUND = new Set([404]);
const FORWARDED_CARD_ERRORS = new Set([404, 409, 412]);

export function bffHandlers({ routing, timeoutMs }: { routing: Routing; timeoutMs: number }) {
  const call = () => ({ signal: AbortSignal.timeout(timeoutMs) });

  function routeFor(request: FastifyRequest, reply: FastifyReply): Upstreams {
    const { upstreams, sources } = route(routing, request.userId);
    if (routing.mock) reply.header("Qred-Data-Sources", describeSources(sources));
    return upstreams;
  }

  async function loadCardOverview(
    { identity, card, billing }: Upstreams,
    companyId: string | undefined,
  ): Promise<CardOverviewScreen> {
    const { data: me } = await required("Identity API", identity.GET("/me", call()));
    const selectedCompanyId = companyId ?? me.companies[0]?.id;
    if (!selectedCompanyId || !me.companies.some((c) => c.id === selectedCompanyId)) {
      throw httpErrors.notFound("The Company does not exist or the User is not a member of it.");
    }

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

    if (!cardId) {
      return assembleCardOverview({ me, selectedCompanyId, card: null, spend: null, transactions: null, invoices: await invoices });
    }

    const path = { path: { cardId } };
    const [cardResult, spend, transactions] = await Promise.all([
      required("Card API", card.GET("/cards/{cardId}", { params: path, ...call() })),
      optional(card.GET("/cards/{cardId}/spend", { params: path, ...call() })),
      optional(card.GET("/cards/{cardId}/transactions", { params: { ...path, query: { limit: LATEST_TRANSACTIONS } }, ...call() })),
    ]);
    const etag = cardResult.response.headers.get("etag");
    if (!etag) throw badGateway("Card API answered without an ETag.");

    return assembleCardOverview({
      me,
      selectedCompanyId,
      card: { data: cardResult.data, etag },
      spend,
      transactions,
      invoices: await invoices,
    });
  }

  return {
    async getCardOverviewScreen(request: FastifyRequest<{ Querystring: ScreenQuery }>, reply: FastifyReply) {
      return loadCardOverview(routeFor(request, reply), request.query.companyId);
    },

    async putCard(request: FastifyRequest<{ Params: PutCardPath; Headers: PutCardHeaders; Body: PutCardBody }>, reply: FastifyReply) {
      const upstreams = routeFor(request, reply);
      const { card } = upstreams;
      const path = { path: { cardId: request.params.cardId } };

      const { data: current } = await required("Card API", card.GET("/cards/{cardId}", { params: path, ...call() }), CARD_NOT_FOUND);

      await required(
        "Card API",
        card.PUT("/cards/{cardId}", {
          params: { ...path, header: { "If-Match": request.headers["if-match"] } },
          body: { settings: current.settings, state: { status: request.body.status, closedReason: null } },
          ...call(),
        }),
        FORWARDED_CARD_ERRORS,
      );

      return loadCardOverview(upstreams, current.details.companyId);
    },
  };
}

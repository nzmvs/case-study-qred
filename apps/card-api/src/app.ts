import path from "node:path";
import { fileURLToPath } from "node:url";
import Fastify, { type FastifyServerOptions, type preValidationHookHandler, type RouteOptions } from "fastify";
import openapiGlue from "fastify-openapi-glue";
import { bearerAuth, type Principals } from "./auth.js";
import type { Database } from "./db/database.js";
import { type Clock, cardHandlers } from "./handlers.js";
import { problemHandler } from "./problems.js";

const DEFAULT_CONTRACT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../contracts/card-api.yaml");

type AppOptions = {
  db: Database;
  principals: Principals;
  clock?: Clock;
  contractPath?: string;
  logger?: FastifyServerOptions["logger"];
};

/** The contract's array query parameters use `style: form, explode: false`: `?status=a,b`. */
function splitCommaSeparatedArrays(route: RouteOptions) {
  const properties = (route.schema?.querystring as { properties?: Record<string, { type?: string }> } | undefined)?.properties;
  const arrays = Object.entries(properties ?? {})
    .filter(([, schema]) => schema.type === "array")
    .map(([name]) => name);
  if (arrays.length === 0) return;

  const split: preValidationHookHandler = async (request) => {
    const query = request.query as Record<string, unknown>;
    for (const name of arrays) {
      if (typeof query[name] === "string") query[name] = query[name].split(",");
    }
  };
  route.preValidation = [split, ...[route.preValidation ?? []].flat()];
}

export async function buildApp({ db, principals, clock = () => new Date(), contractPath = DEFAULT_CONTRACT, logger = false }: AppOptions) {
  const app = Fastify({
    logger,
    // Reject unknown properties as the contract says (additionalProperties: false) instead of stripping them.
    ajv: { customOptions: { removeAdditional: false } },
  });

  app.setErrorHandler(problemHandler);
  app.addHook("onRoute", splitCommaSeparatedArrays);
  app.get("/health", async () => ({ status: "ok" }));

  await app.register(openapiGlue, {
    specification: contractPath,
    serviceHandlers: cardHandlers({ db, clock }),
    securityHandlers: { bearerAuth: bearerAuth(principals) },
  });
  return app;
}

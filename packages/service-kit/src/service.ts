import Fastify, { type FastifyServerOptions, type preValidationHookHandler, type RouteOptions } from "fastify";
import openapiGlue from "fastify-openapi-glue";
import { bearerAuth, type Principals } from "./auth.js";
import { type ErrorMapper, problemHandler } from "./problems.js";

type ServiceOptions = {
  /** The service's OpenAPI contract: routes, validation and serialisation all come from it. */
  contractPath: string;
  /** One handler per `operationId` in the contract. */
  serviceHandlers: object;
  principals: Principals;
  mapError?: ErrorMapper;
  logger?: FastifyServerOptions["logger"];
};

/** The contracts' array query parameters use `style: form, explode: false`: `?status=a,b`. */
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

export async function buildService({ contractPath, serviceHandlers, principals, mapError, logger = false }: ServiceOptions) {
  const app = Fastify({
    logger,
    // Reject unknown properties as the contracts say (additionalProperties: false) instead of stripping them.
    ajv: { customOptions: { removeAdditional: false } },
  });

  app.setErrorHandler(problemHandler(mapError));
  app.addHook("onRoute", splitCommaSeparatedArrays);
  app.get("/health", async () => ({ status: "ok" }));

  await app.register(openapiGlue, {
    specification: contractPath,
    serviceHandlers,
    securityHandlers: { bearerAuth: bearerAuth(principals) },
  });
  return app;
}

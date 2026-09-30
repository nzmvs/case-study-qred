import { Ajv, type Options as AjvOptions } from "ajv";
import addFormats from "ajv-formats";
import Fastify from "fastify";
import qs from "qs";

function contractValidators() {
  const base: AjvOptions = { useDefaults: true, removeAdditional: false, allErrors: false, strict: false };
  const coercing = addFormats.default(new Ajv({ ...base, coerceTypes: "array" }));
  const exact = addFormats.default(new Ajv({ ...base, coerceTypes: false }));
  return ({ schema, httpPart }: { schema: object; httpPart?: string }) =>
    httpPart === "body" ? exact.compile(schema) : coercing.compile(httpPart === "headers" ? lowercaseHeaders(schema) : schema);
}

function lowercaseHeaders(schema: { properties?: Record<string, unknown>; required?: string[] }) {
  return {
    ...schema,
    ...(schema.properties
      ? { properties: Object.fromEntries(Object.entries(schema.properties).map(([k, v]) => [k.toLowerCase(), v])) }
      : {}),
    ...(schema.required ? { required: schema.required.map((name) => name.toLowerCase()) } : {}),
  };
}

export function createService() {
  const app = Fastify({
    logger: true,
    routerOptions: { querystringParser: (query) => qs.parse(query, { comma: true }) },
  });
  app.setValidatorCompiler(contractValidators());
  app.removeContentTypeParser("text/plain");
  app.get("/health", async () => ({ status: "ok" }));
  return app;
}

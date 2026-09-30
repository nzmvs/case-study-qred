/**
 * Dev-only demo harness: serves the demo page, proxies it to the App BFF as a demo User, toggles the
 * BFF's upstream flags in Unleash, and records purchases as the Card processor would. Never deployed.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import replyFrom from "@fastify/reply-from";
import envSchema from "env-schema";
import Fastify, { type FastifyReply } from "fastify";

const url = { type: "string", minLength: 1 } as const;
const config = envSchema<{
  PORT: number;
  APP_BFF_URL: string;
  CARD_API_URL: string;
  UNLEASH_URL: string;
  UNLEASH_ADMIN_USER: string;
  UNLEASH_ADMIN_PASSWORD: string;
}>({
  schema: {
    type: "object",
    required: ["APP_BFF_URL", "CARD_API_URL", "UNLEASH_URL"],
    properties: {
      PORT: { type: "integer", default: 3100 },
      APP_BFF_URL: url,
      CARD_API_URL: url,
      UNLEASH_URL: url,
      UNLEASH_ADMIN_USER: { type: "string", default: "admin" },
      UNLEASH_ADMIN_PASSWORD: { type: "string", default: "unleash4all" },
    },
  },
});
const PAGE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../public/index.html");

const UPSTREAMS = ["identity", "card", "billing"] as const;
type Upstream = (typeof UPSTREAMS)[number];
const flagName = (upstream: Upstream) => `bff-${upstream}-api-real`;
const isUpstream = (value: string): value is Upstream => (UPSTREAMS as readonly string[]).includes(value);

/** Unleash has no startup admin token, so the harness signs in as the admin and reuses the session. */
let unleashSession: string | undefined;

async function signIn(): Promise<string> {
  const response = await fetch(`${config.UNLEASH_URL}/auth/simple/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: config.UNLEASH_ADMIN_USER, password: config.UNLEASH_ADMIN_PASSWORD }),
  });
  const cookie = response.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  if (!response.ok || !cookie) throw new Error(`Unleash sign-in failed (${response.status})`);
  return cookie;
}

async function unleashAdmin(path: string, method = "GET"): Promise<Response> {
  unleashSession ??= await signIn();
  let response = await fetch(`${config.UNLEASH_URL}/api/admin/projects/default/features${path}`, { method, headers: { Cookie: unleashSession } });
  if (response.status === 401) {
    unleashSession = await signIn();
    response = await fetch(`${config.UNLEASH_URL}/api/admin/projects/default/features${path}`, { method, headers: { Cookie: unleashSession } });
  }
  return response;
}

async function relay(reply: FastifyReply, response: Response) {
  for (const header of ["content-type", "qred-data-sources"]) {
    const value = response.headers.get(header);
    if (value) reply.header(header, value);
  }
  return reply.code(response.status).send(await response.text());
}

const app = Fastify({ logger: true });

app.get("/health", async () => ({ status: "ok" }));

app.get("/", async (_request, reply) => reply.type("text/html; charset=utf-8").send(await readFile(PAGE)));

// The page talks to the real App BFF through here: same origin, and the BFF needs no CORS.
await app.register(replyFrom, { base: config.APP_BFF_URL });
app.route({
  method: ["GET", "PUT"],
  url: "/bff/*",
  handler: (request, reply) =>
    reply.from(request.url.replace(/^\/bff/, "")),
});

app.get("/flags", async () => {
  const entries = await Promise.all(
    UPSTREAMS.map(async (upstream) => {
      const response = await unleashAdmin(`/${flagName(upstream)}`);
      if (!response.ok) return [upstream, null] as const;
      const flag = (await response.json()) as { environments: { name: string; enabled: boolean }[] };
      return [upstream, flag.environments.find((e) => e.name === "development")?.enabled ?? null] as const;
    }),
  );
  return Object.fromEntries(entries);
});

app.put<{ Params: { upstream: string }; Body: { real?: unknown } }>("/flags/:upstream", async (request, reply) => {
  const { upstream } = request.params;
  if (!isUpstream(upstream) || typeof request.body?.real !== "boolean") {
    return reply.code(400).send({ error: `PUT /flags/{${UPSTREAMS.join("|")}} with { "real": true|false }` });
  }
  const response = await unleashAdmin(`/${flagName(upstream)}/environments/development/${request.body.real ? "on" : "off"}`, "POST");
  return reply.code(response.ok ? 204 : 502).send();
});

// Stands in for the Card processor: records an authorised purchase on the real Card API.
app.post<{ Body: { cardId?: unknown; amount?: unknown; currency?: unknown; merchantName?: unknown } }>(
  "/purchases",
  async (request, reply) => {
    const { cardId, amount, currency, merchantName } = request.body ?? {};
    if (typeof cardId !== "string" || !Number.isInteger(amount) || typeof currency !== "string") {
      return reply.code(400).send({ error: "POST /purchases with { cardId, amount (minor units), currency, merchantName? }" });
    }
    const response = await fetch(`${config.CARD_API_URL}/cards/${encodeURIComponent(cardId)}/transactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: { amount, currency },
        merchantName: typeof merchantName === "string" && merchantName ? merchantName : "Demo purchase",
        occurredAt: new Date().toISOString(),
      }),
    });
    return relay(reply, response);
  },
);

await app.listen({ host: "0.0.0.0", port: config.PORT });

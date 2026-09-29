import Fastify from "fastify";

const port = Number(process.env.PORT ?? 3001);

const app = Fastify({ logger: true });

app.get("/health", async () => ({ status: "ok" }));

await app.listen({ host: "0.0.0.0", port });

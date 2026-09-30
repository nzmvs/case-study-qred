import type { FastifyInstance } from "fastify";

declare module "fastify" {
  interface FastifyRequest {
    userId: string;
  }
}

/**
 * Every request acts as one fixed demo User (ADR 0006). In production an identity middleware would
 * set `request.userId` from a verified token instead; nothing downstream would change.
 */
export function injectDemoUser(app: FastifyInstance, userId: string) {
  app.decorateRequest("userId", "");
  app.addHook("onRequest", async (request) => {
    request.userId = userId;
  });
}

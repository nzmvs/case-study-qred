import fp from "fastify-plugin";

declare module "fastify" {
  interface FastifyRequest {
    userId: string;
  }
}

export const demoIdentity = fp<{ userId: string }>(async (app, { userId }) => {
  app.decorateRequest("userId", "");
  app.addHook("onRequest", async (request) => {
    request.userId = userId;
  });
});

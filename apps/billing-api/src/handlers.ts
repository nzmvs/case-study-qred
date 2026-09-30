import type { FastifyRequest } from "fastify";
import type { Expression, Kysely, SqlBool } from "kysely";
import type { DB } from "./db/types.js";
import { effectiveStatus, InvoiceStatus, type StoredInvoiceStatus } from "./domain/invoice-status.js";
import type { components, operations } from "./generated/billing-api.js";

type Query = NonNullable<operations["listInvoices"]["parameters"]["query"]>;
type Invoice = components["schemas"]["Invoice"];

export function billingHandlers({ db }: { db: Kysely<DB> }) {
  return {
    async listInvoices(request: FastifyRequest<{ Querystring: Query }>) {
      const { companyId, status, limit = 20 } = request.query;

      const now = new Date();
      const rows = await db
        .selectFrom("invoices")
        .selectAll()
        .where("companyId", "=", companyId)
        .$if(status !== undefined, (q) =>
          q.where((eb) => {
            const conditions: Record<InvoiceStatus, Expression<SqlBool>> = {
              [InvoiceStatus.Open]: eb.and([eb("status", "=", InvoiceStatus.Open), eb("dueAt", ">", now)]),
              [InvoiceStatus.Overdue]: eb.and([eb("status", "=", InvoiceStatus.Open), eb("dueAt", "<=", now)]),
              [InvoiceStatus.Paid]: eb("status", "=", InvoiceStatus.Paid),
            };
            return eb.or(status!.map((s) => conditions[s]));
          }),
        )
        .orderBy("dueDate")
        .orderBy("id")
        .limit(limit)
        .execute();

      const items: Invoice[] = rows.map((row) => ({
        id: row.id,
        companyId: row.companyId,
        amount: { amount: row.amount, currency: row.currency },
        dueDate: row.dueDate,
        status: effectiveStatus(row.status as StoredInvoiceStatus, row.dueAt, now),
        issuedAt: row.issuedAt.toISOString(),
      }));
      return { items };
    },
  };
}

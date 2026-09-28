import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// Raw client, exported for seed scripts and test cleanup ONLY. Application
// code must always go through `db` (the extended client) or a Tx handle.
export const unsafeRawClient =
  globalForPrisma.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = unsafeRawClient;
}

export class AppendOnlyViolation extends Error {
  constructor() {
    super("AuditEvent is append-only: updates and deletes are forbidden");
    this.name = "AppendOnlyViolation";
  }
}

function forbidden(): never {
  throw new AppendOnlyViolation();
}

// Append-only enforcement in the data layer: any attempt to mutate an
// AuditEvent through this client throws before the query is issued. In
// Postgres, the application's DB role should additionally be denied
// UPDATE/DELETE on the audit table (see README).
export const db = unsafeRawClient.$extends({
  name: "append-only-audit",
  query: {
    auditEvent: {
      update: forbidden,
      updateMany: forbidden,
      upsert: forbidden,
      delete: forbidden,
      deleteMany: forbidden,
    },
  },
});

export type Db = typeof db;
// Handle handed to tool code by the platform's transaction wrappers — the
// extended client minus client-level methods, i.e. what db.$transaction's
// callback receives. Audit-mutation blocks apply to Tx handles too.
export type Tx = Omit<
  Db,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

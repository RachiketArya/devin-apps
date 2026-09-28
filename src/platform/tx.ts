import { db, type Tx } from "@/platform/db";
import { requirePermission } from "@/platform/authz/authorize";
import type { SessionUser } from "@/platform/auth/types";

export interface AuditSpec {
  action: string;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  reason?: string;
  /** Override the audit actor — used when an approval executes on behalf of the requester. */
  actor?: { id: string; role: string };
}

export interface TxResult<T> {
  result: T;
  /** One audit spec per mutation performed; written in the same transaction. */
  audit: AuditSpec | AuditSpec[];
}

/**
 * The ONLY way tool code may mutate state. It authorizes first, runs the
 * caller's writes inside a single transaction, and appends the declared audit
 * event(s) in that same transaction — so authorization and audit cannot be
 * skipped, reordered, or lost to a partial write.
 */
export async function withAuthorizedTx<T>(
  user: SessionUser | null,
  permission: string,
  run: (tx: Tx) => Promise<TxResult<T>>,
): Promise<T> {
  requirePermission(user, permission);
  return db.$transaction(async (tx) => {
    const { result, audit } = await run(tx);
    for (const spec of Array.isArray(audit) ? audit : [audit]) {
      await tx.auditEvent.create({
        data: {
          actorId: spec.actor?.id ?? user.id,
          actorRole: spec.actor?.role ?? user.role,
          action: spec.action,
          entityType: spec.entityType,
          entityId: spec.entityId,
          before:
            spec.before === undefined ? null : JSON.stringify(spec.before),
          after: spec.after === undefined ? null : JSON.stringify(spec.after),
          reason: spec.reason ?? null,
        },
      });
    }
    return result;
  });
}

/**
 * Read-only counterpart: authorize() first, then a plain read against the
 * extended client. Produces no audit event.
 */
export async function withAuthorizedRead<T>(
  user: SessionUser | null,
  permission: string,
  run: (dbClient: typeof db) => Promise<T>,
): Promise<T> {
  requirePermission(user, permission);
  return run(db);
}

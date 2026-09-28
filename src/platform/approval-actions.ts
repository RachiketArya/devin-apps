import type { Tx } from "@/platform/db";
import type { AuditSpec } from "@/platform/tx";
import type { SessionUser } from "@/platform/auth/types";

export type ApprovalActionFn = (
  tx: Tx,
  payload: unknown,
  ctx: { requester: SessionUser },
) => Promise<{ result?: unknown; audit: AuditSpec | AuditSpec[] }>;

/**
 * Action registry for maker-checker. Kept in a leaf module (no platform
 * imports beyond types) so tools can register at module load without
 * import-cycle hazards.
 */
const actions = new Map<string, ApprovalActionFn>();

export function registerApprovalAction(key: string, fn: ApprovalActionFn) {
  actions.set(key, fn);
}

export function getApprovalAction(key: string): ApprovalActionFn | undefined {
  return actions.get(key);
}

import type { Role } from "@/platform/auth/types";

/**
 * Refunds permissions -> roles. Merged into the global grant map by the tool
 * registry; anything unlisted is denied to everyone.
 *
 * finance_ops runs the queue (create, approve, reject, mark paid, and decide
 * approval requests — the platform still blocks deciding your own request).
 * analyst is read-only. admin sees everything through refunds:view + the
 * platform-wide pii:read grant. finance_ops is added to pii:reveal so it can
 * inspect customer details through the audited reveal rather than blanket
 * unmasked reads.
 */
export const refundsPermissions: Record<string, Role[]> = {
  "refunds:view": ["finance_ops", "analyst", "admin"],
  "refunds:create": ["finance_ops"],
  "refunds:approve": ["finance_ops"],
  "refunds:reject": ["finance_ops"],
  "refunds:mark-paid": ["finance_ops"],
  // Maker-checker approver permission for refunds over the USD threshold.
  "refunds:approve-request": ["finance_ops"],
  // Extends the platform grant: audited single-record PII reveal.
  "pii:reveal": ["finance_ops"],
};

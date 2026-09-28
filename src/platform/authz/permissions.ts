import type { Role } from "@/platform/auth/types";

/**
 * Permission grants: permission -> roles. Platform permissions live here;
 * each tool contributes its own via its ToolDef in the registry. Any
 * permission not listed is granted to NOBODY (default deny).
 */
export const PLATFORM_PERMISSIONS: Record<string, Role[]> = {
  // Read PII columns unmasked everywhere, without an audited reveal.
  "pii:read": ["admin"],
  // Reveal a single record's PII through the explicit, audited action.
  "pii:reveal": ["analyst", "senior_analyst", "admin"],
  // View the /audit page.
  "audit:read": ["admin"],
  // View the /approvals inbox (it only lists what you can decide).
  "approvals:view": [
    "analyst",
    "senior_analyst",
    "finance_ops",
    "engineer",
    "admin",
  ],
};

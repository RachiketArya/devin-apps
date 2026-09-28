import { authorize } from "@/platform/authz/authorize";
import type { SessionUser } from "@/platform/auth/types";

export const PII_MASK = "••••••";

/**
 * Convention: DTOs group tagged PII in a `pii` sub-object. maskPii replaces
 * every value with a fixed mask for users without `pii:read`. Masking happens
 * server-side; the client never receives the raw values.
 */
export function maskPii<T extends object>(pii: T, user: SessionUser | null): T {
  if (authorize(user, "pii:read")) return pii;
  const masked = { ...pii } as Record<string, unknown>;
  for (const key of Object.keys(masked)) {
    if (masked[key] != null) masked[key] = PII_MASK;
  }
  return masked as T;
}

import { cache } from "react";
import { DevIdentityProvider } from "@/platform/auth/dev";
import { EntraIdentityProvider } from "@/platform/auth/entra";
import type { IdentityProvider, SessionUser } from "@/platform/auth/types";

/**
 * Provider switch. IDENTITY_PROVIDER=dev uses the seeded-user dev provider;
 * "entra" selects the production stub (see entra.ts for the wiring docs).
 */
export function getIdentityProvider(): IdentityProvider {
  const key = process.env.IDENTITY_PROVIDER ?? "dev";
  if (key === "entra") return new EntraIdentityProvider();
  return new DevIdentityProvider();
}

/** Per-request memoized session lookup used by pages, actions and wrappers. */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  return getIdentityProvider().getSessionUser();
});

import type {
  IdentityProvider,
  SessionUser,
} from "@/platform/auth/types";

/**
 * Production identity provider (STUB — not wired to a real IdP).
 *
 * Intended production design, in order of preference:
 *
 * 1. Hosting-platform auth headers. If the app sits behind an authenticated
 *    gateway (e.g. Azure Container Apps / App Service Easy Auth), the platform
 *    injects `x-ms-client-principal` (base64 JSON of claims). Read it here,
 *    verify it comes from the gateway (never trust the header at the edge),
 *    and map the Entra group claims to one of the five roles.
 * 2. Direct OIDC. Validate the Entra-issued ID token (signature + iss + aud +
 *    exp) server-side and map `groups`/`roles` claims to SessionUser.role.
 *
 * To switch: set IDENTITY_PROVIDER=entra and implement the claim mapping in
 * getSessionUser below, then delete the throw. No other code changes: every
 * page, action and wrapper only ever sees SessionUser.
 *
 * There is no password auth — this stub deliberately cannot authenticate.
 */
export class EntraIdentityProvider implements IdentityProvider {
  key = "entra";

  async getSessionUser(): Promise<SessionUser | null> {
    // TODO(prod): read x-ms-client-principal or validate the OIDC ID token,
    // map Entra group claims to a Role, resolve/create the User row, return
    // { id, email, name, role }.
    throw new Error(
      "EntraIdentityProvider is a stub — implement claim mapping before enabling",
    );
  }

  async listSignInOptions(): Promise<SessionUser[]> {
    // SSO providers redirect; there is no user picker in production.
    return [];
  }
}

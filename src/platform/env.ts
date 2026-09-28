/**
 * Environment safety gate. Local dev and tests keep their convenient
 * defaults; production must fail closed on the two things that would
 * otherwise silently weaken auth:
 *   - IDENTITY_PROVIDER unset or "dev" (the dev provider has no credentials)
 *   - AUTH_SECRET unset or the public dev default (session cookies forgeable)
 */

export const DEV_AUTH_SECRET = "dev-only-insecure-secret";
export const DEV_IDENTITY_PROVIDER = "dev";

export function assertSafeEnv(): void {
  if (process.env.NODE_ENV !== "production") return;

  const provider = process.env.IDENTITY_PROVIDER;
  if (!provider || provider === DEV_IDENTITY_PROVIDER) {
    throw new Error(
      `Refusing to start: production requires a real identity provider ` +
        `(IDENTITY_PROVIDER is ${provider === undefined ? "unset" : `"${provider}"`}).`,
    );
  }

  const secret = process.env.AUTH_SECRET;
  if (!secret || secret === DEV_AUTH_SECRET) {
    throw new Error(
      "Refusing to start: production requires AUTH_SECRET set to a non-default value.",
    );
  }
}

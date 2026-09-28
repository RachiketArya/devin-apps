export const ROLES = [
  "analyst",
  "senior_analyst",
  "finance_ops",
  "engineer",
  "admin",
] as const;

export type Role = (typeof ROLES)[number];

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: Role;
}

/**
 * Identity provider contract. The platform only ever sees SessionUser;
 * how the user authenticated is the provider's business. Implementations
 * must be registered in src/platform/auth/index.ts and selected via the
 * IDENTITY_PROVIDER env var. There is no password auth anywhere.
 */
export interface IdentityProvider {
  key: string;
  /** Resolve the signed-in user for the current request, or null. */
  getSessionUser(): Promise<SessionUser | null>;
  /**
   * Users offered on the sign-in page. The dev provider lists seeded users;
   * production providers typically render nothing (SSO redirect instead).
   */
  listSignInOptions(): Promise<SessionUser[]>;
}

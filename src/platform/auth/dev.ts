import { cookies } from "next/headers";
import { db } from "@/platform/db";
import { decodeSession, SESSION_COOKIE } from "@/platform/auth/session";
import type {
  IdentityProvider,
  SessionUser,
} from "@/platform/auth/types";

/**
 * Development identity provider. Authentication is a signed cookie holding a
 * seeded user's id, set by the /dev/sign-in route. Dev only — it trusts the
 * database as the source of truth and performs no credential check.
 */
export class DevIdentityProvider implements IdentityProvider {
  key = "dev";

  async getSessionUser(): Promise<SessionUser | null> {
    const store = await cookies();
    const userId = decodeSession(store.get(SESSION_COOKIE)?.value);
    if (!userId) return null;
    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user) return null;
    return { id: user.id, email: user.email, name: user.name, role: user.role as SessionUser["role"] };
  }

  async listSignInOptions(): Promise<SessionUser[]> {
    const users = await db.user.findMany({ orderBy: { email: "asc" } });
    return users.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role as SessionUser["role"],
    }));
  }
}

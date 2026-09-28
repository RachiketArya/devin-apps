import { PrismaClient } from "@prisma/client";
import { db } from "@/platform/db";
import { SEED_USERS } from "@/platform/users";
import { tools } from "@/platform/registry";
import type { SessionUser } from "@/platform/auth/types";

/**
 * Raw (unextended) client — used ONLY for test cleanup and seeding, which is
 * allowed to delete audit events between tests. Application code under test
 * always goes through the extended `db` / Tx handles.
 */
export const raw = new PrismaClient();

// The extended (append-only-audit) client, re-exported so tests under
// src/apps can read state without importing the db module directly.
export { db };

export async function resetDb() {
  await raw.kycNote.deleteMany();
  await raw.kycDocument.deleteMany();
  await raw.approvalRequest.deleteMany();
  await raw.kycCase.deleteMany();
  await raw.auditEvent.deleteMany();
  await raw.user.deleteMany();
  await raw.user.createMany({ data: SEED_USERS });
}

export async function seedTools() {
  await db.$transaction(async (tx) => {
    for (const tool of tools) {
      if (tool.seed) await tool.seed(tx);
    }
  });
}

export async function userByEmail(email: string): Promise<SessionUser> {
  const u = await raw.user.findUniqueOrThrow({ where: { email } });
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role as SessionUser["role"],
  };
}

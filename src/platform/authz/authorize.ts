import type { SessionUser } from "@/platform/auth/types";
import { PLATFORM_PERMISSIONS } from "@/platform/authz/permissions";
import { tools } from "@/platform/registry";

export class ForbiddenError extends Error {
  readonly status = 403;
  constructor(permission: string) {
    super(`Forbidden: missing permission "${permission}"`);
    this.name = "ForbiddenError";
  }
}

/** permission -> roles, platform + every registered tool. Default deny. */
export function permissionGrants(): Record<string, string[]> {
  const grants: Record<string, string[]> = { ...PLATFORM_PERMISSIONS };
  for (const tool of tools) {
    for (const [perm, roles] of Object.entries(tool.permissions)) {
      grants[perm] = [...(grants[perm] ?? []), ...roles];
    }
  }
  return grants;
}

/** The single authorization check. Unknown permission -> deny. */
export function authorize(user: SessionUser | null, permission: string): boolean {
  if (!user) return false;
  const roles = permissionGrants()[permission];
  return Array.isArray(roles) && roles.includes(user.role);
}

export function requirePermission(
  user: SessionUser | null,
  permission: string,
): asserts user is SessionUser {
  if (!authorize(user, permission)) throw new ForbiddenError(permission);
}

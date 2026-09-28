import type { Role } from "@/platform/auth/types";
import type { Tx } from "@/platform/db";
import { kyc } from "@/apps/kyc/tool";

export interface ToolDef {
  /** Stable key used in audit events and approval requests. */
  key: string;
  name: string;
  description: string;
  /** Route the tool is mounted at, e.g. "/kyc". */
  path: string;
  /** Permission required to see and open the tool. */
  viewPermission: string;
  /** permission -> roles this tool contributes to the global grant map. */
  permissions: Record<string, Role[]>;
  /** Seed function run by `pnpm db:seed` / `pnpm db:reset`. */
  seed?: (tx: Tx) => Promise<unknown>;
}

/**
 * The tool registry: adding a tool means a new folder under src/apps/, a new
 * file under prisma/schema/, and ONE line here.
 */
export const tools: ToolDef[] = [
  kyc,
  // register new tools here — one line each
];

export function toolByPath(path: string): ToolDef | undefined {
  return tools.find((t) => t.path === path);
}

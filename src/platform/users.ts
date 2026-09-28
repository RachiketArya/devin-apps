import type { Role } from "@/platform/auth/types";

/** One seeded user per role, used by the dev provider and tests. */
export const SEED_USERS: { email: string; name: string; role: Role }[] = [
  { email: "analyst@dev.local", name: "Ada Analyst", role: "analyst" },
  { email: "senior@dev.local", name: "Sam Senior", role: "senior_analyst" },
  { email: "finance@dev.local", name: "Fern Finance", role: "finance_ops" },
  { email: "engineer@dev.local", name: "Ed Engineer", role: "engineer" },
  { email: "admin@dev.local", name: "Rue Admin", role: "admin" },
];

/**
 * Seed orchestrator: seeds the platform users, then delegates to each
 * registered tool's seed() in one transaction. Tools supply seed data through
 * their ToolDef — adding a tool requires no change here.
 */
process.loadEnvFile();

import { db } from "../src/platform/db";
import { SEED_USERS } from "../src/platform/users";
import { tools } from "../src/platform/registry";

async function main() {
  await db.$transaction(async (tx) => {
    for (const u of SEED_USERS) {
      await tx.user.upsert({
        where: { email: u.email },
        update: { name: u.name, role: u.role },
        create: u,
      });
    }
    for (const tool of tools) {
      if (tool.seed) {
        console.log(`seeding ${tool.key}...`);
        await tool.seed(tx);
      }
    }
  });
  console.log("seed complete");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());

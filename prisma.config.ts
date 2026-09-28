// prisma.config.ts disables dotenv autoload; Node's loadEnvFile replaces it.
// .env is untracked (copied from .env.example), so tolerate its absence.
import { existsSync } from "node:fs";
import { defineConfig } from "prisma/config";

if (existsSync(".env")) process.loadEnvFile();

export default defineConfig({
  schema: "prisma/schema",
  migrations: {
    seed: "tsx prisma/seed.ts",
  },
});

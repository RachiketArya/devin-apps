// prisma.config.ts disables dotenv autoload; Node's loadEnvFile replaces it.
import { defineConfig } from "prisma/config";

process.loadEnvFile();

export default defineConfig({
  schema: "prisma/schema",
  migrations: {
    seed: "tsx prisma/seed.ts",
  },
});

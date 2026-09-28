import { execSync } from "node:child_process";
import path from "node:path";

/** Push the schema to a dedicated test database once per run. */
export default function globalSetup() {
  execSync("pnpm prisma db push --force-reset --skip-generate", {
    cwd: path.resolve(__dirname, ".."),
    env: { ...process.env, DATABASE_URL: "file:./test.db" },
    stdio: "inherit",
  });
}

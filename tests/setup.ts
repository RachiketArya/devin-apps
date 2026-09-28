import { beforeEach, afterAll } from "vitest";
import { resetDb, raw } from "./helpers";

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await raw.$disconnect();
});

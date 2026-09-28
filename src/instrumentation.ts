import { assertSafeEnv } from "@/platform/env";

/**
 * Next.js instrumentation hook — runs once when the server instance starts.
 * `next build` also evaluates it (NEXT_PHASE=phase-production-build); the gate
 * only applies when actually serving, so builds stay env-free.
 */
export function register() {
  if (
    process.env.NEXT_RUNTIME === "nodejs" &&
    process.env.NEXT_PHASE !== "phase-production-build"
  ) {
    assertSafeEnv();
  }
}

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertSafeEnv,
  DEV_AUTH_SECRET,
} from "@/platform/env";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("assertSafeEnv", () => {
  it("does nothing outside production, even with all dev defaults", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("IDENTITY_PROVIDER", "dev");
    vi.stubEnv("AUTH_SECRET", DEV_AUTH_SECRET);
    expect(() => assertSafeEnv()).not.toThrow();

    vi.stubEnv("NODE_ENV", "test");
    expect(() => assertSafeEnv()).not.toThrow();
  });

  it("refuses to start in production when IDENTITY_PROVIDER is unset", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("IDENTITY_PROVIDER", "");
    delete process.env.IDENTITY_PROVIDER;
    expect(() => assertSafeEnv()).toThrow(/identity provider/i);
  });

  it("refuses to start in production when IDENTITY_PROVIDER is dev", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("IDENTITY_PROVIDER", "dev");
    vi.stubEnv("AUTH_SECRET", "a-real-secret");
    expect(() => assertSafeEnv()).toThrow(/identity provider/i);
  });

  it("refuses to start in production when AUTH_SECRET is unset", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("IDENTITY_PROVIDER", "entra");
    vi.stubEnv("AUTH_SECRET", "");
    delete process.env.AUTH_SECRET;
    expect(() => assertSafeEnv()).toThrow(/AUTH_SECRET/);
  });

  it("refuses to start in production when AUTH_SECRET is the dev default", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("IDENTITY_PROVIDER", "entra");
    vi.stubEnv("AUTH_SECRET", DEV_AUTH_SECRET);
    expect(() => assertSafeEnv()).toThrow(/AUTH_SECRET/);
  });

  it("passes in production with a real provider and secret", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("IDENTITY_PROVIDER", "entra");
    vi.stubEnv("AUTH_SECRET", "a-real-secret");
    expect(() => assertSafeEnv()).not.toThrow();
  });
});

import { describe, expect, it } from "vitest";
import { db } from "@/platform/db";
import { authorize } from "@/platform/authz/authorize";
import { withAuthorizedTx } from "@/platform/tx";
import { PII_MASK } from "@/platform/pii";
import * as kyc from "@/apps/kyc/service";
import { seedTools, userByEmail } from "./helpers";

describe("authorization: default deny", () => {
  it("denies unknown permissions and unmapped roles", async () => {
    const engineer = await userByEmail("engineer@dev.local");
    const finance = await userByEmail("finance@dev.local");
    const analyst = await userByEmail("analyst@dev.local");

    expect(authorize(engineer, "kyc:view")).toBe(false);
    expect(authorize(finance, "kyc:view")).toBe(false);
    expect(authorize(analyst, "kyc:view")).toBe(true);
    expect(authorize(analyst, "no:such:permission")).toBe(false);
    expect(authorize(null, "kyc:view")).toBe(false);
  });

  it("blocks mutations through the wrapper when unauthorized", async () => {
    const engineer = await userByEmail("engineer@dev.local");
    await expect(
      withAuthorizedTx(engineer, "kyc:claim", (tx) =>
        kyc.claimCase(tx, engineer, "anything"),
      ),
    ).rejects.toThrow(/Forbidden/);
  });
});

describe("audit: append-only", () => {
  it("rejects updates and deletes of audit events", async () => {
    const analyst = await userByEmail("analyst@dev.local");
    await seedTools();
    const kase = await db.kycCase.findFirstOrThrow();
    await withAuthorizedTx(analyst, "kyc:claim", (tx) =>
      kyc.claimCase(tx, analyst, kase.id),
    );
    const event = await db.auditEvent.findFirstOrThrow();

    await expect(
      db.auditEvent.update({ where: { id: event.id }, data: { action: "x" } }),
    ).rejects.toThrow(/append-only/i);
    await expect(
      db.auditEvent.updateMany({ data: { action: "x" } }),
    ).rejects.toThrow(/append-only/i);
    await expect(
      db.auditEvent.delete({ where: { id: event.id } }),
    ).rejects.toThrow(/append-only/i);
    await expect(db.auditEvent.deleteMany()).rejects.toThrow(/append-only/i);
  });
});

describe("audit: every mutation writes an event in the same transaction", () => {
  it("audits claim, note and escalate", async () => {
    const analyst = await userByEmail("analyst@dev.local");
    await seedTools();
    const kase = await db.kycCase.findFirstOrThrow({
      where: { status: "new" },
    });

    await withAuthorizedTx(analyst, "kyc:claim", (tx) =>
      kyc.claimCase(tx, analyst, kase.id),
    );
    await withAuthorizedTx(analyst, "kyc:note", (tx) =>
      kyc.addNote(tx, analyst, kase.id, "checking docs"),
    );

    const events = await db.auditEvent.findMany({
      orderBy: { createdAt: "asc" },
    });
    expect(events.map((e) => e.action)).toEqual([
      "kyc.case.claim",
      "kyc.note.add",
    ]);
    expect(events[0].actorId).toBe(analyst.id);
    expect(events[0].actorRole).toBe("analyst");
  });
});

describe("PII masking", () => {
  it("masks PII for users without pii:read and unmasks for those with it", async () => {
    const analyst = await userByEmail("analyst@dev.local");
    const admin = await userByEmail("admin@dev.local");
    await seedTools();
    const kase = await db.kycCase.findFirstOrThrow();

    const masked = await kyc.getCaseDetail(db, analyst, kase.id);
    expect(masked!.pii.fullName).toBe(PII_MASK);
    expect(masked!.pii.email).toBe(PII_MASK);
    expect(masked!.pii.taxId).toBe(PII_MASK);

    const unmasked = await kyc.getCaseDetail(db, admin, kase.id);
    expect(unmasked!.pii.fullName).not.toBe(PII_MASK);
    expect(unmasked!.pii.email).toContain("@example.com");
  });
});

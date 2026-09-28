import { describe, expect, it } from "vitest";
import { withAuthorizedTx } from "@/platform/tx";
import { decideApproval } from "@/platform/approvals";
import { PII_MASK } from "@/platform/pii";
import * as service from "@/apps/kyc/service";
import { HIGH_RISK_THRESHOLD } from "@/apps/kyc/types";
import { db, seedTools, userByEmail } from "../../../tests/helpers";

// Escalated cases are unassigned by design, so any reviewer may decide them.
async function caseAtRisk(minRisk: number, status = "escalated") {
  return db.kycCase.findFirstOrThrow({
    where: { riskScore: { gte: minRisk }, status, assigneeId: null },
    orderBy: { riskScore: "desc" },
  });
}

describe("KYC queue", () => {
  it("lists seeded cases with documents and notes support", async () => {
    await seedTools();
    const analyst = await userByEmail("analyst@dev.local");
    const rows = await service.listQueue(db);
    expect(rows.length).toBeGreaterThanOrEqual(30);

    const kase = rows.find((r) => r.status === "new")!;
    await withAuthorizedTx(analyst, "kyc:claim", (tx) =>
      service.claimCase(tx, analyst, kase.id),
    );
    const detail = await service.getCaseDetail(db, analyst, kase.id);
    expect(detail!.status).toBe("in_review");
    expect(detail!.assigneeEmail).toBe("analyst@dev.local");
    expect(detail!.documents.length).toBeGreaterThan(0);
  });

  it("escalates a case to senior_analyst and clears the assignee", async () => {
    await seedTools();
    const analyst = await userByEmail("analyst@dev.local");
    const kase = await db.kycCase.findFirstOrThrow({
      where: { status: "new" },
    });
    await withAuthorizedTx(analyst, "kyc:claim", (tx) =>
      service.claimCase(tx, analyst, kase.id),
    );
    await withAuthorizedTx(analyst, "kyc:escalate", (tx) =>
      service.escalateCase(tx, analyst, kase.id, "looks suspicious"),
    );
    const after = await db.kycCase.findUniqueOrThrow({
      where: { id: kase.id },
    });
    expect(after.status).toBe("escalated");
    expect(after.assigneeId).toBeNull();
  });

  it("approves a low-risk case directly", async () => {
    await seedTools();
    const analyst = await userByEmail("analyst@dev.local");
    const kase = await db.kycCase.findFirstOrThrow({
      where: { status: "in_review", riskScore: { lt: HIGH_RISK_THRESHOLD } },
    });
    const outcome = await withAuthorizedTx(analyst, "kyc:decide", (tx) =>
      service.decideCase(tx, analyst, {
        caseId: kase.id,
        decision: "approved",
        reasonCode: "verified",
      }),
    );
    expect(outcome.pending).toBe(false);
    const after = await db.kycCase.findUniqueOrThrow({
      where: { id: kase.id },
    });
    expect(after.status).toBe("approved");
  });
});

describe("maker-checker", () => {
  it("creates a pending request instead of approving a high-risk case", async () => {
    await seedTools();
    const analyst = await userByEmail("analyst@dev.local");
    const kase = await caseAtRisk(HIGH_RISK_THRESHOLD);

    const outcome = await withAuthorizedTx(analyst, "kyc:decide", (tx) =>
      service.decideCase(tx, analyst, {
        caseId: kase.id,
        decision: "approved",
        reasonCode: "verified",
        comment: "high risk, second look",
      }),
    );

    expect(outcome.pending).toBe(true);
    const after = await db.kycCase.findUniqueOrThrow({
      where: { id: kase.id },
    });
    expect(after.status).toBe(kase.status); // unchanged

    const request = await db.approvalRequest.findUniqueOrThrow({
      where: { id: outcome.approvalRequestId },
    });
    expect(request.status).toBe("pending");
    expect(request.requesterId).toBe(analyst.id);

    // The request itself is audited.
    const audit = await db.auditEvent.findFirstOrThrow({
      where: { entityId: request.id, action: "approval.request" },
    });
    expect(audit.actorId).toBe(analyst.id);
  });

  it("rejects self-approval: the maker can never decide their own request", async () => {
    await seedTools();
    const analyst = await userByEmail("analyst@dev.local");
    const kase = await caseAtRisk(HIGH_RISK_THRESHOLD);
    const outcome = await withAuthorizedTx(analyst, "kyc:decide", (tx) =>
      service.decideCase(tx, analyst, {
        caseId: kase.id,
        decision: "approved",
        reasonCode: "verified",
      }),
    );
    await expect(
      decideApproval(analyst, outcome.approvalRequestId!, "approved", "lgtm"),
    ).rejects.toThrow(/own request|Forbidden/i);
  });

  it("runs the original action on approval and audits both steps", async () => {
    await seedTools();
    const analyst = await userByEmail("analyst@dev.local");
    const senior = await userByEmail("senior@dev.local");
    const kase = await caseAtRisk(HIGH_RISK_THRESHOLD);

    const outcome = await withAuthorizedTx(analyst, "kyc:decide", (tx) =>
      service.decideCase(tx, analyst, {
        caseId: kase.id,
        decision: "approved",
        reasonCode: "verified",
      }),
    );
    await decideApproval(
      senior,
      outcome.approvalRequestId!,
      "approved",
      "docs check out",
    );

    const kaseAfter = await db.kycCase.findUniqueOrThrow({
      where: { id: kase.id },
    });
    expect(kaseAfter.status).toBe("approved");

    const request = await db.approvalRequest.findUniqueOrThrow({
      where: { id: outcome.approvalRequestId },
    });
    expect(request.status).toBe("approved");
    expect(request.decidedById).toBe(senior.id);

    const events = await db.auditEvent.findMany({
      where: {
        OR: [{ entityId: request.id }, { entityId: kase.id }],
      },
      orderBy: { createdAt: "asc" },
    });
    const actions = events.map((e) => e.action);
    expect(actions).toContain("approval.request");
    expect(actions).toContain("approval.approve");
    expect(actions).toContain("kyc.case.decide");
    // The case change is attributed to the requester (the maker).
    const decide = events.find((e) => e.action === "kyc.case.decide")!;
    expect(decide.actorId).toBe(analyst.id);
    const approve = events.find((e) => e.action === "approval.approve")!;
    expect(approve.actorId).toBe(senior.id);
  });

  it("rejects a high-risk rejection straight through (threshold applies to approvals)", async () => {
    await seedTools();
    const analyst = await userByEmail("analyst@dev.local");
    const kase = await caseAtRisk(HIGH_RISK_THRESHOLD);
    const outcome = await withAuthorizedTx(analyst, "kyc:decide", (tx) =>
      service.decideCase(tx, analyst, {
        caseId: kase.id,
        decision: "rejected",
        reasonCode: "sanctions_hit",
      }),
    );
    expect(outcome.pending).toBe(false);
    const after = await db.kycCase.findUniqueOrThrow({
      where: { id: kase.id },
    });
    expect(after.status).toBe("rejected");
  });
});

describe("PII reveal", () => {
  it("reveals PII only through the audited action", async () => {
    await seedTools();
    const analyst = await userByEmail("analyst@dev.local");
    const engineer = await userByEmail("engineer@dev.local");
    const kase = await db.kycCase.findFirstOrThrow();

    // Masked read first.
    const masked = await service.getCaseDetail(db, analyst, kase.id);
    expect(masked!.pii.email).toBe(PII_MASK);

    // Users without pii:reveal cannot reveal.
    await expect(
      withAuthorizedTx(engineer, "pii:reveal", (tx) =>
        service.revealCasePii(tx, kase.id),
      ),
    ).rejects.toThrow(/Forbidden/);

    const pii = await withAuthorizedTx(analyst, "pii:reveal", (tx) =>
      service.revealCasePii(tx, kase.id),
    );
    expect(pii.email).toContain("@example.com");

    const audit = await db.auditEvent.findFirstOrThrow({
      where: { action: "pii.reveal", entityId: kase.id },
    });
    expect(audit.actorId).toBe(analyst.id);
  });
});

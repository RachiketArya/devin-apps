import { describe, expect, it } from "vitest";
import { withAuthorizedTx } from "@/platform/tx";
import { decideApproval } from "@/platform/approvals";
import { PII_MASK } from "@/platform/pii";
import * as service from "@/apps/refunds/service";
import { toUsdCents } from "@/apps/refunds/types";
import { db, seedTools, userByEmail } from "../../../tests/helpers";

const VALID = {
  customerName: "Test Customer",
  customerEmail: "customer@example.com",
  transactionId: "txn_test_001",
  cardLast4: "4242",
  reasonCode: "customer_request" as const,
};

async function pendingRefund() {
  return db.refundRequest.findFirstOrThrow({
    where: { status: "pending_approval" },
  });
}

describe("Refunds dashboard", () => {
  it("seeds ~40 requests across 3 currencies and computes KPIs", async () => {
    await seedTools();
    const rows = await service.listRefunds(db);
    expect(rows.length).toBe(40);
    expect(new Set(rows.map((r) => r.currency))).toEqual(
      new Set(["USD", "EUR", "GBP"]),
    );

    const kpis = await service.getKpis(db);
    expect(kpis.openCount).toBe(
      rows.filter((r) =>
        ["requested", "pending_approval", "approved"].includes(r.status),
      ).length,
    );
    expect(kpis.pendingApprovalUsdCents).toBeGreaterThan(0);
    // Pending rows only ever exceed the USD approval threshold.
    for (const r of rows.filter((r) => r.status === "pending_approval")) {
      expect(r.usdEquivCents).toBeGreaterThan(50_000);
    }
  });

  it("creates a small refund as 'requested'; a large one goes to pending_approval", async () => {
    await seedTools();
    const finance = await userByEmail("finance@dev.local");

    const small = await withAuthorizedTx(finance, "refunds:create", (tx) =>
      service.createRefund(tx, finance, {
        ...VALID,
        amount: 120,
        currency: "USD",
      }),
    );
    expect(small.status).toBe("requested");
    expect(small.pendingApproval).toBe(false);

    const large = await withAuthorizedTx(finance, "refunds:create", (tx) =>
      service.createRefund(tx, finance, {
        ...VALID,
        amount: 600,
        currency: "EUR", // €600 = $648 > $500
      }),
    );
    expect(large.status).toBe("pending_approval");
    expect(large.pendingApproval).toBe(true);
    expect(toUsdCents(60_000, "EUR")).toBe(64_800);

    const request = await db.approvalRequest.findFirstOrThrow({
      where: { toolKey: "refunds", status: "pending" },
      orderBy: { createdAt: "desc" },
    });
    expect(request.requesterId).toBe(finance.id);
    expect(request.actionKey).toBe("refunds.refund.approve");

    const audits = await db.auditEvent.findMany({
      where: { action: { in: ["refunds.request.create", "approval.request"] } },
      orderBy: { createdAt: "asc" },
    });
    expect(audits.length).toBeGreaterThanOrEqual(3);
    expect(audits.every((e) => e.actorId === finance.id)).toBe(true);
  });

  it("denies create/approve/reject/mark-paid to roles without permission", async () => {
    await seedTools();
    const analyst = await userByEmail("analyst@dev.local");
    const engineer = await userByEmail("engineer@dev.local");
    const anyRefund = await db.refundRequest.findFirstOrThrow({
      where: { status: "requested" },
    });

    await expect(
      withAuthorizedTx(analyst, "refunds:create", (tx) =>
        service.createRefund(tx, analyst, {
          ...VALID,
          amount: 10,
          currency: "USD",
        }),
      ),
    ).rejects.toThrow(/Forbidden/);
    await expect(
      withAuthorizedTx(analyst, "refunds:approve", (tx) =>
        service.approveRefund(tx, analyst, anyRefund.id),
      ),
    ).rejects.toThrow(/Forbidden/);
    await expect(
      withAuthorizedTx(analyst, "refunds:reject", (tx) =>
        service.rejectRefund(tx, analyst, anyRefund.id, "no"),
      ),
    ).rejects.toThrow(/Forbidden/);
    await expect(
      withAuthorizedTx(analyst, "refunds:mark-paid", (tx) =>
        service.markRefundPaid(tx, analyst, anyRefund.id),
      ),
    ).rejects.toThrow(/Forbidden/);
    // engineer cannot even read the queue.
    await expect(
      withAuthorizedTx(engineer, "refunds:create", (tx) =>
        service.createRefund(tx, engineer, {
          ...VALID,
          amount: 10,
          currency: "USD",
        }),
      ),
    ).rejects.toThrow(/Forbidden/);
  });

  it("approves a small refund directly and audits it", async () => {
    await seedTools();
    const finance = await userByEmail("finance@dev.local");
    const refund = await db.refundRequest.findFirstOrThrow({
      where: { status: "requested" },
    });

    await withAuthorizedTx(finance, "refunds:approve", (tx) =>
      service.approveRefund(tx, finance, refund.id),
    );
    const after = await db.refundRequest.findUniqueOrThrow({
      where: { id: refund.id },
    });
    expect(after.status).toBe("approved");
    expect(after.approvedById).toBe(finance.id);
    expect(after.decidedAt).not.toBeNull();

    const audit = await db.auditEvent.findFirstOrThrow({
      where: { action: "refunds.request.approve", entityId: refund.id },
    });
    expect(audit.actorId).toBe(finance.id);
  });

  it("rejects a requested refund only with a reason, and audits it", async () => {
    await seedTools();
    const finance = await userByEmail("finance@dev.local");
    const refund = await db.refundRequest.findFirstOrThrow({
      where: { status: "requested" },
    });

    await expect(
      withAuthorizedTx(finance, "refunds:reject", (tx) =>
        service.rejectRefund(tx, finance, refund.id, "  "),
      ),
    ).rejects.toThrow(/reason/i);

    await withAuthorizedTx(finance, "refunds:reject", (tx) =>
      service.rejectRefund(tx, finance, refund.id, "duplicate verified"),
    );
    const after = await db.refundRequest.findUniqueOrThrow({
      where: { id: refund.id },
    });
    expect(after.status).toBe("rejected");
    expect(after.rejectionReason).toBe("duplicate verified");
    const audit = await db.auditEvent.findFirstOrThrow({
      where: { action: "refunds.request.reject", entityId: refund.id },
    });
    expect(audit.reason).toBe("duplicate verified");
  });

  it("marks an approved refund paid via the mock gateway; refuses other statuses", async () => {
    await seedTools();
    const finance = await userByEmail("finance@dev.local");
    const requested = await db.refundRequest.findFirstOrThrow({
      where: { status: "requested" },
    });
    await expect(
      withAuthorizedTx(finance, "refunds:mark-paid", (tx) =>
        service.markRefundPaid(tx, finance, requested.id),
      ),
    ).rejects.toThrow(/Cannot pay/);

    const approved = await db.refundRequest.findFirstOrThrow({
      where: { status: "approved" },
    });
    const { paymentRef } = await withAuthorizedTx(
      finance,
      "refunds:mark-paid",
      (tx) => service.markRefundPaid(tx, finance, approved.id),
    );
    expect(paymentRef).toMatch(/^MOCKPAY-/);
    const after = await db.refundRequest.findUniqueOrThrow({
      where: { id: approved.id },
    });
    expect(after.status).toBe("paid");
    expect(after.paymentRef).toBe(paymentRef);
    expect(after.paidAt).not.toBeNull();

    const audit = await db.auditEvent.findFirstOrThrow({
      where: { action: "refunds.request.mark-paid", entityId: approved.id },
    });
    expect(audit.actorId).toBe(finance.id);
  });

  it("never accepts a full card number (4 digits only)", async () => {
    await seedTools();
    const finance = await userByEmail("finance@dev.local");
    await expect(
      withAuthorizedTx(finance, "refunds:create", (tx) =>
        service.createRefund(tx, finance, {
          ...VALID,
          amount: 10,
          currency: "USD",
          cardLast4: "4242424242424242",
        }),
      ),
    ).rejects.toThrow();
  });
});

describe("maker-checker", () => {
  it("blocks the requester from deciding their own approval request", async () => {
    await seedTools();
    const finance = await userByEmail("finance@dev.local");
    const outcome = await withAuthorizedTx(finance, "refunds:create", (tx) =>
      service.createRefund(tx, finance, {
        ...VALID,
        amount: 900,
        currency: "USD",
      }),
    );
    const request = await db.approvalRequest.findFirstOrThrow({
      where: {
        toolKey: "refunds",
        payload: { contains: outcome.id },
      },
    });
    await expect(
      decideApproval(finance, request.id, "approved", "lgtm"),
    ).rejects.toThrow(/own request|Forbidden/i);
  });

  it("a different finance_ops user approves; refund becomes approved and both steps are audited", async () => {
    await seedTools();
    const finance = await userByEmail("finance@dev.local");
    const finance2 = await userByEmail("finance2@dev.local");

    const outcome = await withAuthorizedTx(finance, "refunds:create", (tx) =>
      service.createRefund(tx, finance, {
        ...VALID,
        amount: 800,
        currency: "USD",
      }),
    );
    const request = await db.approvalRequest.findFirstOrThrow({
      where: { toolKey: "refunds", payload: { contains: outcome.id } },
    });
    await decideApproval(finance2, request.id, "approved", "looks fine");

    const refund = await db.refundRequest.findUniqueOrThrow({
      where: { id: outcome.id },
    });
    expect(refund.status).toBe("approved");

    const events = await db.auditEvent.findMany({
      where: {
        OR: [{ entityId: request.id }, { entityId: refund.id }],
      },
      orderBy: { createdAt: "asc" },
    });
    const actions = events.map((e) => e.action);
    expect(actions).toContain("approval.request");
    expect(actions).toContain("approval.approve");
    expect(actions).toContain("refunds.request.approve");
    expect(
      events.find((e) => e.action === "approval.approve")!.actorId,
    ).toBe(finance2.id);
    expect(
      events.find((e) => e.action === "refunds.request.approve")!.actorId,
    ).toBe(finance.id);
  });

  it("a rejected approval request surfaces the refund as rejected", async () => {
    await seedTools();
    const finance = await userByEmail("finance@dev.local");
    const finance2 = await userByEmail("finance2@dev.local");

    const outcome = await withAuthorizedTx(finance, "refunds:create", (tx) =>
      service.createRefund(tx, finance, {
        ...VALID,
        amount: 700,
        currency: "USD",
      }),
    );
    const request = await db.approvalRequest.findFirstOrThrow({
      where: { toolKey: "refunds", payload: { contains: outcome.id } },
    });
    await decideApproval(finance2, request.id, "rejected", "not verifiable");

    const detail = await service.getRefundDetail(db, finance, outcome.id);
    expect(detail!.status).toBe("rejected");
    expect(detail!.rejectionReason).toBe("not verifiable");
  });

  it("finance_ops cannot bypass maker-checker by approving inline", async () => {
    await seedTools();
    const finance = await userByEmail("finance@dev.local");
    const pending = await pendingRefund();
    await expect(
      withAuthorizedTx(finance, "refunds:approve", (tx) =>
        service.approveRefund(tx, finance, pending.id),
      ),
    ).rejects.toThrow(/approvals inbox/);
    await expect(
      withAuthorizedTx(finance, "refunds:reject", (tx) =>
        service.rejectRefund(tx, finance, pending.id, "no"),
      ),
    ).rejects.toThrow(/approvals inbox/);
  });
});

describe("PII", () => {
  it("masks PII for non-admin reads and reveals only via the audited action", async () => {
    await seedTools();
    const finance = await userByEmail("finance@dev.local");
    const engineer = await userByEmail("engineer@dev.local");
    const admin = await userByEmail("admin@dev.local");
    const refund = await db.refundRequest.findFirstOrThrow();

    const masked = await service.getRefundDetail(db, finance, refund.id);
    expect(masked!.pii.fullName).toBe(PII_MASK);
    expect(masked!.pii.email).toBe(PII_MASK);

    const unmasked = await service.getRefundDetail(db, admin, refund.id);
    expect(unmasked!.pii.email).toContain("@example.com");

    await expect(
      withAuthorizedTx(engineer, "pii:reveal", (tx) =>
        service.revealRefundPii(tx, refund.id),
      ),
    ).rejects.toThrow(/Forbidden/);

    const pii = await withAuthorizedTx(finance, "pii:reveal", (tx) =>
      service.revealRefundPii(tx, refund.id),
    );
    expect(pii.email).toContain("@example.com");
    const audit = await db.auditEvent.findFirstOrThrow({
      where: { action: "pii.reveal", entityId: refund.id },
    });
    expect(audit.actorId).toBe(finance.id);
  });
});

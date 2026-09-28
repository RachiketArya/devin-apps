import type { Tx } from "@/platform/db";

/**
 * Refund data lives behind this small interface. The local implementation
 * reads the seeded Prisma tables; production can swap in a client over the
 * real refunds/payments system without touching services — only this file
 * changes.
 *
 * A refund that needs maker-checker is stored as `pending_approval` and
 * linked to its ApprovalRequest. When that request is decided the stored
 * status is updated on approval; on rejection the request itself is the
 * record of the outcome, so reads derive the effective status (and the
 * approver/rejection reason) from the linked request.
 */

export interface RefundRow {
  id: string;
  externalRef: string;
  transactionId: string;
  cardLast4: string;
  amountCents: number;
  currency: string;
  usdEquivCents: number;
  reasonCode: string;
  status: string;
  requestedByEmail: string;
  approvedByEmail: string | null;
  createdAt: Date;
}

export interface RefundPii {
  fullName: string;
  email: string;
}

export interface RefundDetail extends RefundRow {
  updatedAt: Date;
  decidedAt: Date | null;
  paidAt: Date | null;
  paymentRef: string | null;
  rejectionReason: string | null;
  approvalRequestId: string | null;
  pii: RefundPii;
}

export interface RefundKpis {
  /** requested + pending_approval + approved (not yet paid out). */
  openCount: number;
  /** USD total of refunds currently awaiting maker-checker. */
  pendingApprovalUsdCents: number;
  /** refunds decided "approved" today (UTC), paid or not. */
  approvedToday: number;
}

type Db = Pick<Tx, "refundRequest" | "approvalRequest">;

export interface RefundSource {
  listRefunds(db: Db): Promise<RefundRow[]>;
  getRefund(db: Db, id: string): Promise<RefundDetail | null>;
  getKpis(db: Db): Promise<RefundKpis>;
}

type ApprovalLite = {
  status: string;
  decisionReason: string | null;
  decidedBy: { email: string } | null;
};

function deriveStatus(status: string, request: ApprovalLite | null): string {
  if (status === "pending_approval" && request) {
    if (request.status === "rejected") return "rejected";
    if (request.status === "approved") return "approved";
  }
  return status;
}

type RefundRowBase = Omit<RefundRow, "status" | "approvedByEmail"> & {
  status: string;
  approvedByEmail: string | null;
  rejectionReason: string | null;
  approvalRequestId: string | null;
};

function toRow(
  r: RefundRowBase,
  request: ApprovalLite | null,
): RefundRow & { rejectionReason: string | null } {
  const status = deriveStatus(r.status, request);
  return {
    id: r.id,
    externalRef: r.externalRef,
    transactionId: r.transactionId,
    cardLast4: r.cardLast4,
    amountCents: r.amountCents,
    currency: r.currency,
    usdEquivCents: r.usdEquivCents,
    reasonCode: r.reasonCode,
    status,
    requestedByEmail: r.requestedByEmail,
    // For approval-flow refunds the decider lives on the ApprovalRequest.
    approvedByEmail:
      r.approvedByEmail ??
      (status === "approved" ? (request?.decidedBy?.email ?? null) : null),
    rejectionReason:
      r.rejectionReason ??
      (status === "rejected" ? (request?.decisionReason ?? null) : null),
    createdAt: r.createdAt,
  };
}

export class PrismaRefundSource implements RefundSource {
  private async approvalsByRefundId(
    db: Db,
    refundIds: string[],
  ): Promise<Map<string, ApprovalLite>> {
    const links = await db.refundRequest.findMany({
      where: { id: { in: refundIds }, approvalRequestId: { not: null } },
      select: { id: true, approvalRequestId: true },
    });
    const out = new Map<string, ApprovalLite>();
    if (links.length === 0) return out;
    const requests = await db.approvalRequest.findMany({
      where: { id: { in: links.map((l) => l.approvalRequestId!) } },
      include: { decidedBy: { select: { email: true } } },
    });
    const byId = new Map(requests.map((r) => [r.id, r]));
    for (const l of links) {
      const req = byId.get(l.approvalRequestId!);
      if (req) out.set(l.id, req);
    }
    return out;
  }

  async listRefunds(db: Db): Promise<RefundRow[]> {
    const rows = await db.refundRequest.findMany({
      orderBy: { createdAt: "desc" },
    });
    const approvals = await this.approvalsByRefundId(
      db,
      rows.map((r) => r.id),
    );
    return rows.map((r) => toRow(r, approvals.get(r.id) ?? null));
  }

  async getRefund(db: Db, id: string): Promise<RefundDetail | null> {
    const r = await db.refundRequest.findUnique({ where: { id } });
    if (!r) return null;
    const request = r.approvalRequestId
      ? await db.approvalRequest.findUnique({
          where: { id: r.approvalRequestId },
          include: { decidedBy: { select: { email: true } } },
        })
      : null;
    return {
      ...toRow(r, request),
      updatedAt: r.updatedAt,
      decidedAt: r.decidedAt,
      paidAt: r.paidAt,
      paymentRef: r.paymentRef,
      approvalRequestId: r.approvalRequestId,
      pii: { fullName: r.piiFullName, email: r.piiEmail },
    };
  }

  async getKpis(db: Db): Promise<RefundKpis> {
    const rows = await this.listRefunds(db);
    const today = new Date().toISOString().slice(0, 10);
    const decided = await db.refundRequest.findMany({
      where: { decidedAt: { not: null } },
      select: { decidedAt: true, status: true },
    });
    return {
      openCount: rows.filter((r) =>
        ["requested", "pending_approval", "approved"].includes(r.status),
      ).length,
      pendingApprovalUsdCents: rows
        .filter((r) => r.status === "pending_approval")
        .reduce((sum, r) => sum + r.usdEquivCents, 0),
      approvedToday: decided.filter(
        (d) =>
          d.decidedAt!.toISOString().slice(0, 10) === today &&
          ["approved", "paid"].includes(d.status),
      ).length,
    };
  }
}

export const refundSource: RefundSource = new PrismaRefundSource();

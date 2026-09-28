import type { Tx } from "@/platform/db";
import { maskPii } from "@/platform/pii";
import { submitForApproval } from "@/platform/approvals";
import type { AuditSpec, TxResult } from "@/platform/tx";
import type { SessionUser } from "@/platform/auth/types";
import {
  refundSource,
  type RefundDetail,
  type RefundSource,
} from "@/apps/refunds/source";
import {
  paymentsGateway,
  type PaymentsGateway,
} from "@/apps/refunds/adapters/payments";
import {
  APPROVAL_THRESHOLD_USD_CENTS,
  createRefundSchema,
  toUsdCents,
  type CreateRefundInput,
  type Currency,
} from "@/apps/refunds/types";

/**
 * Plain-TypeScript business logic. These functions take a transaction handle
 * (never the db client — they cannot import it) and return the audit spec(s)
 * describing what changed; the platform wrapper performs the authorize()
 * check and writes the audit events in the same transaction.
 */

const source: RefundSource = refundSource;
const gateway: PaymentsGateway = paymentsGateway;

type RefundDb = Parameters<RefundSource["listRefunds"]>[0];

export function listRefunds(db: RefundDb) {
  return source.listRefunds(db);
}

export function getKpis(db: RefundDb) {
  return source.getKpis(db);
}

export async function getRefundDetail(
  db: RefundDb,
  user: SessionUser,
  id: string,
): Promise<RefundDetail | null> {
  const detail = await source.getRefund(db, id);
  if (!detail) return null;
  return { ...detail, pii: maskPii(detail.pii, user) };
}

async function mustGetRefund(tx: Tx, id: string) {
  const r = await tx.refundRequest.findUnique({ where: { id } });
  if (!r) throw new Error("Refund request not found");
  return r;
}

async function nextExternalRef(tx: Tx): Promise<string> {
  const count = await tx.refundRequest.count();
  return `RFD-${1001 + count}`;
}

export interface CreateOutcome {
  id: string;
  status: string;
  pendingApproval: boolean;
}

/**
 * Create a refund request. Over the USD threshold the request does not become
 * approvable inline — it is stored as pending_approval with a maker-checker
 * ApprovalRequest whose requester is the creator, so the approver is
 * guaranteed to be a different finance_ops user.
 */
export async function createRefund(
  tx: Tx,
  user: SessionUser,
  rawInput: CreateRefundInput,
): Promise<TxResult<CreateOutcome>> {
  const input = createRefundSchema.parse(rawInput);
  const amountCents = Math.round(input.amount * 100);
  const usdEquivCents = toUsdCents(amountCents, input.currency as Currency);
  const needsApproval = usdEquivCents > APPROVAL_THRESHOLD_USD_CENTS;

  const refund = await tx.refundRequest.create({
    data: {
      externalRef: await nextExternalRef(tx),
      transactionId: input.transactionId,
      cardLast4: input.cardLast4,
      amountCents,
      currency: input.currency,
      usdEquivCents,
      reasonCode: input.reasonCode,
      status: needsApproval ? "pending_approval" : "requested",
      requestedById: user.id,
      requestedByEmail: user.email,
      piiFullName: input.customerName,
      piiEmail: input.customerEmail,
    },
  });

  const audits: AuditSpec[] = [
    {
      action: "refunds.request.create",
      entityType: "RefundRequest",
      entityId: refund.id,
      after: {
        externalRef: refund.externalRef,
        transactionId: refund.transactionId,
        amountCents,
        currency: input.currency,
        usdEquivCents,
        reasonCode: input.reasonCode,
        status: refund.status,
      },
    },
  ];

  if (needsApproval) {
    const request = await submitForApproval(tx, {
      toolKey: "refunds",
      actionKey: "refunds.refund.approve",
      approverPermission: "refunds:approve-request",
      payload: { refundRequestId: refund.id },
      requester: user,
      reason: `USD equivalent $${(usdEquivCents / 100).toFixed(2)} exceeds $${APPROVAL_THRESHOLD_USD_CENTS / 100} threshold`,
    });
    await tx.refundRequest.update({
      where: { id: refund.id },
      data: { approvalRequestId: request.id },
    });
    audits.push({
      action: "approval.request",
      entityType: "ApprovalRequest",
      entityId: request.id,
      after: {
        toolKey: request.toolKey,
        actionKey: request.actionKey,
        refundRequestId: refund.id,
        externalRef: refund.externalRef,
      },
      reason: request.reason ?? undefined,
    });
  }

  return {
    result: {
      id: refund.id,
      status: refund.status,
      pendingApproval: needsApproval,
    },
    audit: audits,
  };
}

/** Direct approval — only for refunds at or under the USD threshold, which
 * sit in "requested". Threshold refunds are decided via /approvals. */
export async function approveRefund(
  tx: Tx,
  user: SessionUser,
  refundId: string,
): Promise<TxResult<void>> {
  const r = await mustGetRefund(tx, refundId);
  if (r.status === "pending_approval") {
    throw new Error("This refund is decided via the approvals inbox");
  }
  if (r.status !== "requested") {
    throw new Error(`Cannot approve a ${r.status} refund`);
  }
  const before = { status: r.status };
  const updated = await tx.refundRequest.update({
    where: { id: r.id },
    data: {
      status: "approved",
      approvedById: user.id,
      approvedByEmail: user.email,
      decidedAt: new Date(),
    },
  });
  return {
    result: undefined,
    audit: {
      action: "refunds.request.approve",
      entityType: "RefundRequest",
      entityId: r.id,
      before,
      after: { status: updated.status, approvedBy: user.email },
    },
  };
}

/** Reject a refund awaiting a first-line decision, with a mandatory reason. */
export async function rejectRefund(
  tx: Tx,
  user: SessionUser,
  refundId: string,
  reason: string,
): Promise<TxResult<void>> {
  if (!reason.trim()) throw new Error("A rejection reason is required");
  const r = await mustGetRefund(tx, refundId);
  if (r.status === "pending_approval") {
    throw new Error("This refund is decided via the approvals inbox");
  }
  if (r.status !== "requested") {
    throw new Error(`Cannot reject a ${r.status} refund`);
  }
  const before = { status: r.status };
  const updated = await tx.refundRequest.update({
    where: { id: r.id },
    data: {
      status: "rejected",
      rejectionReason: reason,
      decidedAt: new Date(),
    },
  });
  return {
    result: undefined,
    audit: {
      action: "refunds.request.reject",
      entityType: "RefundRequest",
      entityId: r.id,
      before,
      after: { status: updated.status, rejectionReason: reason },
      reason,
    },
  };
}

/** Pay an approved refund out through the PaymentsGateway. */
export async function markRefundPaid(
  tx: Tx,
  user: SessionUser,
  refundId: string,
): Promise<TxResult<{ paymentRef: string }>> {
  const r = await mustGetRefund(tx, refundId);
  if (r.status !== "approved") {
    throw new Error(`Cannot pay a ${r.status} refund`);
  }
  const payment = await gateway.refund({
    transactionId: r.transactionId,
    amountCents: r.amountCents,
    currency: r.currency,
    cardLast4: r.cardLast4,
  });
  const before = { status: r.status };
  const updated = await tx.refundRequest.update({
    where: { id: r.id },
    data: {
      status: "paid",
      paymentRef: payment.reference,
      paidAt: new Date(),
    },
  });
  return {
    result: { paymentRef: payment.reference },
    audit: {
      action: "refunds.request.mark-paid",
      entityType: "RefundRequest",
      entityId: r.id,
      before,
      after: {
        status: updated.status,
        paymentRef: payment.reference,
        paidAt: updated.paidAt,
      },
    },
  };
}

/**
 * Approval-action invoked when a different finance_ops user approves a
 * pending request. Registered under "refunds.refund.approve" in tool.ts. The
 * refund's audit event is attributed to the requester (the maker); the
 * approval decision itself is audited separately with the checker as actor.
 */
export async function executeRefundApproval(
  tx: Tx,
  payload: unknown,
  ctx: { requester: SessionUser },
): Promise<{ result: unknown; audit: AuditSpec[] }> {
  const { refundRequestId } = payload as { refundRequestId: string };
  const r = await mustGetRefund(tx, refundRequestId);
  if (r.status !== "pending_approval") {
    throw new Error(`Cannot approve a ${r.status} refund`);
  }
  const before = { status: r.status };
  await tx.refundRequest.update({
    where: { id: r.id },
    data: { status: "approved", decidedAt: new Date() },
  });
  return {
    result: { status: "approved" },
    audit: [
      {
        action: "refunds.request.approve",
        entityType: "RefundRequest",
        entityId: r.id,
        before,
        after: { status: "approved", approvalRequestId: r.approvalRequestId },
        actor: { id: ctx.requester.id, role: ctx.requester.role },
      },
    ],
  };
}

/**
 * Explicit, audited PII reveal for users with `pii:reveal`. The transaction
 * contains only the audit event — the "mutation" is the record of access.
 */
export async function revealRefundPii(
  tx: Tx,
  refundId: string,
): Promise<TxResult<RefundDetail["pii"]>> {
  const detail = await source.getRefund(tx, refundId);
  if (!detail) throw new Error("Refund request not found");
  return {
    result: detail.pii,
    audit: {
      action: "pii.reveal",
      entityType: "RefundRequest",
      entityId: refundId,
      after: { fields: Object.keys(detail.pii) },
    },
  };
}

import type { Tx } from "@/platform/db";
import { maskPii } from "@/platform/pii";
import { submitForApproval } from "@/platform/approvals";
import type { AuditSpec, TxResult } from "@/platform/tx";
import type { SessionUser } from "@/platform/auth/types";
import {
  kycCaseSource,
  type KycCaseDetail,
  type KycCaseSource,
} from "@/apps/kyc/source";
import {
  decisionInputSchema,
  HIGH_RISK_THRESHOLD,
  type DecisionInput,
} from "@/apps/kyc/types";

/**
 * Plain-TypeScript business logic. These functions take a transaction handle
 * (never the db client — they cannot import it) and return the audit spec(s)
 * describing what changed; the platform wrapper performs the authorize()
 * check and writes the audit events in the same transaction.
 */

const source: KycCaseSource = kycCaseSource;

type QueueDb = Parameters<KycCaseSource["listQueue"]>[0];
type DetailDb = Parameters<KycCaseSource["getCase"]>[0];

export function listQueue(db: QueueDb) {
  return source.listQueue(db);
}

export async function getCaseDetail(
  db: DetailDb,
  user: SessionUser,
  id: string,
): Promise<KycCaseDetail | null> {
  const detail = await source.getCase(db, id);
  if (!detail) return null;
  return { ...detail, pii: maskPii(detail.pii, user) };
}

async function mustGetCase(tx: Tx, caseId: string) {
  const c = await tx.kycCase.findUnique({ where: { id: caseId } });
  if (!c) throw new Error("Case not found");
  return c;
}

export async function claimCase(
  tx: Tx,
  user: SessionUser,
  caseId: string,
): Promise<TxResult<void>> {
  const c = await mustGetCase(tx, caseId);
  if (!["new", "in_review", "escalated"].includes(c.status)) {
    throw new Error(`Cannot claim a ${c.status} case`);
  }
  if (c.assigneeId && c.assigneeId !== user.id) {
    throw new Error("Case is already assigned to another reviewer");
  }
  const before = { status: c.status, assigneeId: c.assigneeId };
  const updated = await tx.kycCase.update({
    where: { id: caseId },
    data: { assigneeId: user.id, status: "in_review" },
  });
  return {
    result: undefined,
    audit: {
      action: "kyc.case.claim",
      entityType: "KycCase",
      entityId: caseId,
      before,
      after: { status: updated.status, assigneeId: updated.assigneeId },
    },
  };
}

export async function addNote(
  tx: Tx,
  user: SessionUser,
  caseId: string,
  body: string,
): Promise<TxResult<void>> {
  if (!body.trim()) throw new Error("Note body is required");
  await mustGetCase(tx, caseId);
  const note = await tx.kycNote.create({
    data: { caseId, authorId: user.id, body },
  });
  return {
    result: undefined,
    audit: {
      action: "kyc.note.add",
      entityType: "KycNote",
      entityId: note.id,
      after: { caseId, body },
    },
  };
}

export async function escalateCase(
  tx: Tx,
  user: SessionUser,
  caseId: string,
  reason: string,
): Promise<TxResult<void>> {
  const c = await mustGetCase(tx, caseId);
  if (!["new", "in_review"].includes(c.status)) {
    throw new Error(`Cannot escalate a ${c.status} case`);
  }
  const before = { status: c.status, assigneeId: c.assigneeId };
  const updated = await tx.kycCase.update({
    where: { id: caseId },
    data: { status: "escalated", assigneeId: null },
  });
  return {
    result: undefined,
    audit: {
      action: "kyc.case.escalate",
      entityType: "KycCase",
      entityId: caseId,
      before,
      after: { status: updated.status, assigneeId: null },
      reason,
    },
  };
}

export interface DecideOutcome {
  pending: boolean;
  approvalRequestId?: string;
  status: string;
}

function applyCaseDecisionSpec(
  before: { status: string; assigneeId: string | null },
  caseId: string,
  input: DecisionInput,
  actor: { id: string; role: string },
): AuditSpec {
  return {
    action: "kyc.case.decide",
    entityType: "KycCase",
    entityId: caseId,
    before,
    after: {
      status: input.decision,
      reasonCode: input.reasonCode,
      comment: input.comment ?? null,
    },
    actor,
  };
}

/**
 * Approve or reject a case. Approvals at or above HIGH_RISK_THRESHOLD do not
 * execute — they create a pending ApprovalRequest that a senior_analyst must
 * decide (maker-checker).
 */
export async function decideCase(
  tx: Tx,
  user: SessionUser,
  rawInput: DecisionInput,
): Promise<TxResult<DecideOutcome>> {
  const input = decisionInputSchema.parse(rawInput);
  const c = await mustGetCase(tx, input.caseId);
  if (!["in_review", "escalated"].includes(c.status)) {
    throw new Error(`Cannot decide a ${c.status} case`);
  }
  if (c.assigneeId && c.assigneeId !== user.id) {
    throw new Error("Case is assigned to another reviewer");
  }
  const before = { status: c.status, assigneeId: c.assigneeId };

  if (input.decision === "approved" && c.riskScore >= HIGH_RISK_THRESHOLD) {
    const request = await submitForApproval(tx, {
      toolKey: "kyc",
      actionKey: "kyc.case.decide",
      approverPermission: "kyc:approve-request",
      payload: input,
      requester: user,
      reason: input.comment ?? `risk ${c.riskScore} >= ${HIGH_RISK_THRESHOLD}`,
    });
    return {
      result: {
        pending: true,
        approvalRequestId: request.id,
        status: c.status,
      },
      audit: {
        action: "approval.request",
        entityType: "ApprovalRequest",
        entityId: request.id,
        after: {
          toolKey: request.toolKey,
          actionKey: request.actionKey,
          caseId: input.caseId,
          decision: input.decision,
          reasonCode: input.reasonCode,
        },
        reason: request.reason ?? undefined,
      },
    };
  }

  await tx.kycCase.update({
    where: { id: c.id },
    data: { status: input.decision },
  });
  return {
    result: { pending: false, status: input.decision },
    audit: applyCaseDecisionSpec(before, c.id, input, {
      id: user.id,
      role: user.role,
    }),
  };
}

/**
 * Approval-action invoked when a senior_analyst approves a pending request.
 * Registered under "kyc.case.decide" in tool.ts. The resulting audit event is
 * attributed to the original requester (the maker); the approval decision
 * itself is audited separately with the checker as actor.
 */
export async function executeCaseDecision(
  tx: Tx,
  payload: unknown,
  ctx: { requester: SessionUser },
): Promise<{ result: unknown; audit: AuditSpec[] }> {
  const input = decisionInputSchema.parse(payload);
  const c = await mustGetCase(tx, input.caseId);
  const before = { status: c.status, assigneeId: c.assigneeId };
  await tx.kycCase.update({
    where: { id: c.id },
    data: { status: input.decision, assigneeId: ctx.requester.id },
  });
  return {
    result: { status: input.decision },
    audit: [
      applyCaseDecisionSpec(before, c.id, input, {
        id: ctx.requester.id,
        role: ctx.requester.role,
      }),
    ],
  };
}

/**
 * Explicit, audited PII reveal for users with `pii:reveal`. The transaction
 * contains only the audit event — the "mutation" is the record of access.
 */
export async function revealCasePii(
  tx: Tx,
  caseId: string,
): Promise<TxResult<KycCaseDetail["pii"]>> {
  const detail = await source.getCase(tx, caseId);
  if (!detail) throw new Error("Case not found");
  return {
    result: detail.pii,
    audit: {
      action: "pii.reveal",
      entityType: "KycCase",
      entityId: caseId,
      after: { fields: Object.keys(detail.pii) },
    },
  };
}

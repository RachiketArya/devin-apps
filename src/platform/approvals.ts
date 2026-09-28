import { db, type Tx } from "@/platform/db";
import { getApprovalAction } from "@/platform/approval-actions";
import { authorize, ForbiddenError } from "@/platform/authz/authorize";
import { withAuthorizedTx, type AuditSpec } from "@/platform/tx";
import type { SessionUser } from "@/platform/auth/types";

/**
 * Maker-checker primitive.
 *
 * A tool decides an action needs a second pair of eyes (e.g. above a risk
 * threshold — the threshold itself is tool policy, not platform policy).
 * Instead of executing, it calls submitForApproval() inside its transaction,
 * which records a pending ApprovalRequest. A DIFFERENT user holding the
 * request's approverPermission later calls decideApproval() from /approvals;
 * on approval the registered action runs in the same transaction as the
 * decision, and every step is audited.
 */

export type { ApprovalActionFn } from "@/platform/approval-actions";

export async function submitForApproval(
  tx: Tx,
  input: {
    toolKey: string;
    actionKey: string;
    approverPermission: string;
    payload: unknown;
    requester: SessionUser;
    reason?: string;
  },
) {
  return tx.approvalRequest.create({
    data: {
      toolKey: input.toolKey,
      actionKey: input.actionKey,
      approverPermission: input.approverPermission,
      payload: JSON.stringify(input.payload),
      requesterId: input.requester.id,
      reason: input.reason ?? null,
      status: "pending",
    },
  });
}

export type ApprovalDecision = "approved" | "rejected";

/**
 * Approve or reject a pending request. The decider must hold the request's
 * approverPermission and must not be the requester. On approval the registered
 * action executes in the same transaction; the decision AND the action's own
 * effects are audited atomically.
 */
export async function decideApproval(
  user: SessionUser | null,
  requestId: string,
  decision: ApprovalDecision,
  decisionReason: string,
): Promise<void> {
  const request = await db.approvalRequest.findUnique({
    where: { id: requestId },
  });
  if (!request) throw new Error("Approval request not found");
  if (request.status !== "pending") {
    throw new Error(`Approval request already ${request.status}`);
  }
  if (!user) throw new ForbiddenError(request.approverPermission);
  const decider = user;

  await withAuthorizedTx(decider, request.approverPermission, async (tx) => {
    if (request.requesterId === decider.id) {
      throw new ForbiddenError("makers cannot approve their own request");
    }
    const requester = await tx.user.findUniqueOrThrow({
      where: { id: request.requesterId },
    });

    const audits: AuditSpec[] = [
      {
        action: `approval.${decision === "approved" ? "approve" : "reject"}`,
        entityType: "ApprovalRequest",
        entityId: request.id,
        before: { status: request.status },
        after: { status: decision },
        reason: decisionReason,
      },
    ];

    if (decision === "approved") {
      const fn = getApprovalAction(request.actionKey);
      if (!fn) {
        throw new Error(`No approval action registered for ${request.actionKey}`);
      }
      const executed = await fn(tx, JSON.parse(request.payload), {
        requester: {
          id: requester.id,
          email: requester.email,
          name: requester.name,
          role: requester.role as SessionUser["role"],
        },
      });
      void executed.result;
      // The action's own audit events are attributed to the requester.
      audits.push(
        ...(Array.isArray(executed.audit) ? executed.audit : [executed.audit]),
      );
    }

    await tx.approvalRequest.update({
      where: { id: request.id },
      data: {
        status: decision,
        decidedById: decider.id,
        decidedAt: new Date(),
        decisionReason,
      },
    });

    return { result: undefined, audit: audits };
  });
}

/** Pending requests the user is allowed to decide (excludes their own). */
export async function listApprovableRequests(user: SessionUser) {
  const pending = await db.approvalRequest.findMany({
    where: { status: "pending" },
    orderBy: { createdAt: "desc" },
    include: { requester: true },
  });
  return pending.filter(
    (r) => authorize(user, r.approverPermission) && r.requesterId !== user.id,
  );
}

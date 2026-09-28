"use server";

import { getSessionUser } from "@/platform/auth";
import { withAuthorizedTx } from "@/platform/tx";
import { decideApproval, type ApprovalDecision } from "@/platform/approvals";
import * as service from "@/apps/kyc/service";
import { decisionInputSchema } from "@/apps/kyc/types";
import type { KycCaseDetail } from "@/apps/kyc/source";

export interface ActionResult {
  ok: boolean;
  error?: string;
  pending?: boolean;
}

async function run(fn: () => Promise<unknown>): Promise<ActionResult> {
  try {
    const out = await fn();
    return { ok: true, ...(out as object) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function claimCaseAction(caseId: string) {
  return run(async () => {
    const user = await getSessionUser();
    await withAuthorizedTx(user, "kyc:claim", (tx) =>
      service.claimCase(tx, user!, caseId),
    );
  });
}

export async function addNoteAction(caseId: string, body: string) {
  return run(async () => {
    const user = await getSessionUser();
    await withAuthorizedTx(user, "kyc:note", (tx) =>
      service.addNote(tx, user!, caseId, body),
    );
  });
}

export async function escalateCaseAction(caseId: string, reason: string) {
  return run(async () => {
    const user = await getSessionUser();
    await withAuthorizedTx(user, "kyc:escalate", (tx) =>
      service.escalateCase(tx, user!, caseId, reason),
    );
  });
}

export async function decideCaseAction(
  input: unknown,
): Promise<{ ok: boolean; error?: string; pending?: boolean }> {
  try {
    const user = await getSessionUser();
    const parsed = decisionInputSchema.parse(input);
    const outcome = await withAuthorizedTx(user, "kyc:decide", (tx) =>
      service.decideCase(tx, user!, parsed),
    );
    return { ok: true, pending: outcome.pending };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function revealPiiAction(caseId: string): Promise<{
  ok: boolean;
  error?: string;
  pii?: KycCaseDetail["pii"];
}> {
  try {
    const user = await getSessionUser();
    const pii = await withAuthorizedTx(user, "pii:reveal", (tx) =>
      service.revealCasePii(tx, caseId),
    );
    return { ok: true, pii };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function decideApprovalAction(
  requestId: string,
  decision: ApprovalDecision,
  reason: string,
) {
  return run(async () => {
    const user = await getSessionUser();
    await decideApproval(user, requestId, decision, reason);
  });
}

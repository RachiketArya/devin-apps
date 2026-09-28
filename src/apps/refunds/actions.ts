"use server";

import { getSessionUser } from "@/platform/auth";
import { withAuthorizedTx } from "@/platform/tx";
import * as service from "@/apps/refunds/service";
import { createRefundSchema } from "@/apps/refunds/types";
import type { RefundDetail } from "@/apps/refunds/source";

export interface ActionResult {
  ok: boolean;
  error?: string;
  pending?: boolean;
  paymentRef?: string;
}

async function run(fn: () => Promise<unknown>): Promise<ActionResult> {
  try {
    const out = await fn();
    return { ok: true, ...(out as object) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function createRefundAction(input: unknown) {
  try {
    const user = await getSessionUser();
    const parsed = createRefundSchema.parse(input);
    const outcome = await withAuthorizedTx(user, "refunds:create", (tx) =>
      service.createRefund(tx, user!, parsed),
    );
    return { ok: true, pending: outcome.pendingApproval };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function approveRefundAction(refundId: string) {
  return run(async () => {
    const user = await getSessionUser();
    await withAuthorizedTx(user, "refunds:approve", (tx) =>
      service.approveRefund(tx, user!, refundId),
    );
  });
}

export async function rejectRefundAction(refundId: string, reason: string) {
  return run(async () => {
    const user = await getSessionUser();
    await withAuthorizedTx(user, "refunds:reject", (tx) =>
      service.rejectRefund(tx, user!, refundId, reason),
    );
  });
}

export async function markPaidAction(refundId: string) {
  try {
    const user = await getSessionUser();
    const { paymentRef } = await withAuthorizedTx(
      user,
      "refunds:mark-paid",
      (tx) => service.markRefundPaid(tx, user!, refundId),
    );
    return { ok: true, paymentRef };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function revealPiiAction(refundId: string): Promise<{
  ok: boolean;
  error?: string;
  pii?: RefundDetail["pii"];
}> {
  try {
    const user = await getSessionUser();
    const pii = await withAuthorizedTx(user, "pii:reveal", (tx) =>
      service.revealRefundPii(tx, refundId),
    );
    return { ok: true, pii };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

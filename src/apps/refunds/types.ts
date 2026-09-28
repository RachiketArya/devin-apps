import { z } from "zod";

export const REFUND_STATUSES = [
  "requested",
  "pending_approval",
  "approved",
  "rejected",
  "paid",
] as const;
export type RefundStatus = (typeof REFUND_STATUSES)[number];

export const CURRENCIES = ["USD", "EUR", "GBP"] as const;
export type Currency = (typeof CURRENCIES)[number];

export const REASON_CODES = [
  "duplicate_charge",
  "fraud_suspected",
  "service_not_received",
  "item_not_received",
  "customer_request",
  "other",
] as const;
export type ReasonCode = (typeof REASON_CODES)[number];

/**
 * Fixed demo FX table -> USD. Refunds whose USD equivalent exceeds
 * APPROVAL_THRESHOLD_USD_CENTS must be approved by a different finance_ops
 * user (maker-checker) before they can be paid.
 */
export const USD_RATES: Record<Currency, number> = {
  USD: 1,
  EUR: 1.08,
  GBP: 1.27,
};
export const APPROVAL_THRESHOLD_USD_CENTS = 500_00;

export function toUsdCents(amountCents: number, currency: Currency): number {
  return Math.round(amountCents * USD_RATES[currency]);
}

export const createRefundSchema = z.object({
  customerName: z.string().trim().min(1).max(200),
  customerEmail: z.string().trim().email().max(320),
  transactionId: z.string().trim().min(4).max(64),
  // Exactly four digits — the tool never accepts or stores a full card number.
  cardLast4: z.string().regex(/^\d{4}$/, "card last 4 must be exactly 4 digits"),
  amount: z.coerce.number().positive().max(1_000_000),
  currency: z.enum(CURRENCIES),
  reasonCode: z.enum(REASON_CODES),
});
export type CreateRefundInput = z.infer<typeof createRefundSchema>;

export const approveRefundSchema = z.object({
  refundRequestId: z.string().min(1),
});

export function formatMoney(cents: number, currency: string): string {
  return `${currency} ${(cents / 100).toFixed(2)}`;
}

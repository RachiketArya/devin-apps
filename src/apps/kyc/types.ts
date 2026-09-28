import { z } from "zod";

export const KYC_STATUSES = [
  "new",
  "in_review",
  "escalated",
  "approved",
  "rejected",
] as const;
export type KycStatus = (typeof KYC_STATUSES)[number];

export const REASON_CODES = [
  "verified",
  "documents_complete",
  "sanctions_hit",
  "insufficient_documents",
  "fraud_suspected",
  "other",
] as const;
export type ReasonCode = (typeof REASON_CODES)[number];

/** Approving a case at or above this risk score needs maker-checker. */
export const HIGH_RISK_THRESHOLD = 70;

export const decisionInputSchema = z.object({
  caseId: z.string().min(1),
  decision: z.enum(["approved", "rejected"]),
  reasonCode: z.enum(REASON_CODES),
  comment: z.string().max(2000).optional(),
});
export type DecisionInput = z.infer<typeof decisionInputSchema>;

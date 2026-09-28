import type { Role } from "@/platform/auth/types";

/**
 * KYC permissions -> roles. Merged into the global grant map by the tool
 * registry; anything unlisted is denied to everyone.
 */
export const kycPermissions: Record<string, Role[]> = {
  "kyc:view": ["analyst", "senior_analyst", "admin"],
  "kyc:claim": ["analyst", "senior_analyst"],
  "kyc:note": ["analyst", "senior_analyst"],
  "kyc:decide": ["analyst", "senior_analyst"],
  "kyc:escalate": ["analyst"],
  // Maker-checker approver permission for high-risk approvals.
  "kyc:approve-request": ["senior_analyst"],
};

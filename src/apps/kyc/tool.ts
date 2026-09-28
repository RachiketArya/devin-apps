import type { ToolDef } from "@/platform/registry";
import { registerApprovalAction } from "@/platform/approval-actions";
import { kycPermissions } from "@/apps/kyc/permissions";
import { seed } from "@/apps/kyc/seed";
import { executeCaseDecision } from "@/apps/kyc/service";

export const kyc: ToolDef = {
  key: "kyc",
  name: "KYC Review Queue",
  description: "Review and disposition KYC cases.",
  path: "/kyc",
  viewPermission: "kyc:view",
  permissions: kycPermissions,
  seed,
};

// Actions an approval is allowed to execute, keyed by ApprovalRequest.actionKey.
registerApprovalAction("kyc.case.decide", executeCaseDecision);

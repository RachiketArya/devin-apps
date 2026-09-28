import type { ToolDef } from "@/platform/registry";
import { registerApprovalAction } from "@/platform/approval-actions";
import { refundsPermissions } from "@/apps/refunds/permissions";
import { seed } from "@/apps/refunds/seed";
import { executeRefundApproval } from "@/apps/refunds/service";

export const refunds: ToolDef = {
  key: "refunds",
  name: "Refunds",
  description: "Create, approve and pay out customer refunds.",
  path: "/refunds",
  viewPermission: "refunds:view",
  permissions: refundsPermissions,
  seed,
};

// Actions an approval is allowed to execute, keyed by ApprovalRequest.actionKey.
registerApprovalAction("refunds.refund.approve", executeRefundApproval);

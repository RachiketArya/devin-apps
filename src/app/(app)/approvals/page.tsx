import { getSessionUser } from "@/platform/auth";
import { authorize } from "@/platform/authz/authorize";
import { listApprovableRequests } from "@/platform/approvals";
import { ApprovalDecisionForm } from "./approval-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/platform/ui/card";
import { Badge } from "@/platform/ui/badge";

export default async function ApprovalsPage() {
  const user = await getSessionUser();
  if (!authorize(user, "approvals:view")) {
    return <p className="text-muted-foreground">403 — missing approvals:view</p>;
  }
  const requests = await listApprovableRequests(user!);
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Approvals inbox</h1>
      <p className="text-sm text-muted-foreground">
        Pending requests you are allowed to decide. You can never approve your
        own requests.
      </p>
      {requests.length === 0 && (
        <p className="text-muted-foreground">Nothing awaiting your approval.</p>
      )}
      <div className="space-y-3">
        {requests.map((r) => (
          <Card key={r.id}>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <CardTitle className="text-base">{r.actionKey}</CardTitle>
                <Badge variant="secondary">{r.toolKey}</Badge>
                <Badge>pending</Badge>
              </div>
              <CardDescription>
                Requested by {r.requester.email} ·{" "}
                {r.createdAt.toISOString().slice(0, 16).replace("T", " ")}
                {r.reason ? ` · ${r.reason}` : ""}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">
                {JSON.stringify(JSON.parse(r.payload), null, 2)}
              </pre>
              <ApprovalDecisionForm requestId={r.id} />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

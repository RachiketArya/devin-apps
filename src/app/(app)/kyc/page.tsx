import { getSessionUser } from "@/platform/auth";
import { authorize } from "@/platform/authz/authorize";
import { withAuthorizedRead } from "@/platform/tx";
import * as service from "@/apps/kyc/service";
import { QueueView } from "@/apps/kyc/queue-view";

export default async function KycPage() {
  const user = await getSessionUser();
  if (!authorize(user, "kyc:view")) {
    return <p className="text-muted-foreground">403 — missing kyc:view</p>;
  }
  const rows = await withAuthorizedRead(user, "kyc:view", (db) =>
    service.listQueue(db),
  );
  const details: Record<string, NonNullable<
    Awaited<ReturnType<typeof service.getCaseDetail>>
  >> = {};
  await withAuthorizedRead(user, "kyc:view", async (db) => {
    for (const r of rows) {
      const d = await service.getCaseDetail(db, user!, r.id);
      if (d) details[r.id] = d;
    }
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">KYC review queue</h1>
      <QueueView
        rows={JSON.parse(JSON.stringify(rows))}
        details={JSON.parse(JSON.stringify(details))}
        can={{
          claim: authorize(user, "kyc:claim"),
          note: authorize(user, "kyc:note"),
          decide: authorize(user, "kyc:decide"),
          escalate: authorize(user, "kyc:escalate"),
          reveal: authorize(user, "pii:reveal"),
        }}
        userEmail={user!.email}
      />
    </div>
  );
}

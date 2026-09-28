import { getSessionUser } from "@/platform/auth";
import { authorize } from "@/platform/authz/authorize";
import { withAuthorizedRead } from "@/platform/tx";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/platform/ui/card";
import * as service from "@/apps/refunds/service";
import { RefundsView } from "@/apps/refunds/refunds-view";
import { formatMoney } from "@/apps/refunds/types";

export default async function RefundsPage() {
  const user = await getSessionUser();
  if (!authorize(user, "refunds:view")) {
    return <p className="text-muted-foreground">403 — missing refunds:view</p>;
  }
  const rows = await withAuthorizedRead(user, "refunds:view", (db) =>
    service.listRefunds(db),
  );
  const kpis = await withAuthorizedRead(user, "refunds:view", (db) =>
    service.getKpis(db),
  );
  const details: Record<
    string,
    NonNullable<Awaited<ReturnType<typeof service.getRefundDetail>>>
  > = {};
  await withAuthorizedRead(user, "refunds:view", async (db) => {
    for (const r of rows) {
      const d = await service.getRefundDetail(db, user!, r.id);
      if (d) details[r.id] = d;
    }
  });

  const tiles = [
    { label: "Open requests", value: String(kpis.openCount) },
    {
      label: "Pending approval (USD)",
      value: formatMoney(kpis.pendingApprovalUsdCents, "USD"),
    },
    { label: "Approved today", value: String(kpis.approvedToday) },
  ];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Refunds dashboard</h1>
      <div className="grid gap-4 sm:grid-cols-3">
        {tiles.map((t) => (
          <Card key={t.label} className="py-4">
            <CardHeader className="pb-0">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {t.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold">{t.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <RefundsView
        rows={JSON.parse(JSON.stringify(rows))}
        details={JSON.parse(JSON.stringify(details))}
        can={{
          create: authorize(user, "refunds:create"),
          approve: authorize(user, "refunds:approve"),
          reject: authorize(user, "refunds:reject"),
          markPaid: authorize(user, "refunds:mark-paid"),
          reveal: authorize(user, "pii:reveal"),
        }}
      />
    </div>
  );
}

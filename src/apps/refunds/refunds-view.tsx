"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DataTable, type Column } from "@/platform/ui/data-table";
import { DetailDrawer } from "@/platform/ui/detail-drawer";
import { Badge } from "@/platform/ui/badge";
import { Button } from "@/platform/ui/button";
import { Input } from "@/platform/ui/input";
import { Textarea } from "@/platform/ui/textarea";
import { Label } from "@/platform/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/platform/ui/select";
import {
  approveRefundAction,
  createRefundAction,
  markPaidAction,
  rejectRefundAction,
  revealPiiAction,
} from "@/apps/refunds/actions";
import {
  APPROVAL_THRESHOLD_USD_CENTS,
  CURRENCIES,
  formatMoney,
  REASON_CODES,
  toUsdCents,
  type Currency,
} from "@/apps/refunds/types";
import type { RefundDetail, RefundRow } from "@/apps/refunds/source";

interface Caps {
  create: boolean;
  approve: boolean;
  reject: boolean;
  markPaid: boolean;
  reveal: boolean;
}

function StatusBadge({ status }: { status: string }) {
  const variant =
    status === "approved" || status === "paid"
      ? "default"
      : status === "rejected"
        ? "destructive"
        : status === "pending_approval"
          ? "secondary"
          : "outline";
  return <Badge variant={variant}>{status}</Badge>;
}

export function RefundsView({
  rows,
  details,
  can,
}: {
  rows: RefundRow[];
  details: Record<string, RefundDetail>;
  can: Caps;
}) {
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [pii, setPii] = useState<Record<string, RefundDetail["pii"]>>({});
  const [rejectReason, setRejectReason] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // create form state
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [transactionId, setTransactionId] = useState("");
  const [cardLast4, setCardLast4] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<string>(CURRENCIES[0]);
  const [reasonCode, setReasonCode] = useState<string>(REASON_CODES[0]);

  const detail = openId ? details[openId] : null;
  const effectivePii = openId ? (pii[openId] ?? detail?.pii) : undefined;
  const amountCents = Math.round((parseFloat(amount) || 0) * 100);
  const usdEquiv = toUsdCents(amountCents, currency as Currency);
  const willNeedApproval =
    amountCents > 0 && usdEquiv > APPROVAL_THRESHOLD_USD_CENTS;

  async function run<T extends { ok: boolean; error?: string }>(
    fn: () => Promise<T>,
  ): Promise<T> {
    setBusy(true);
    setMessage(null);
    setNotice(null);
    const res = await fn();
    setBusy(false);
    if (!res.ok) setMessage(res.error ?? "Failed");
    else router.refresh();
    return res;
  }

  const columns: Column<RefundRow>[] = [
    {
      key: "ref",
      header: "Ref",
      value: (r) => r.externalRef,
      render: (r) => <span className="font-mono">{r.externalRef}</span>,
    },
    {
      key: "transaction",
      header: "Transaction",
      value: (r) => r.transactionId,
      render: (r) => <span className="font-mono text-xs">{r.transactionId}</span>,
    },
    {
      key: "amount",
      header: "Amount",
      value: (r) => r.amountCents,
      render: (r) => formatMoney(r.amountCents, r.currency),
    },
    {
      key: "usd",
      header: "USD equiv",
      value: (r) => r.usdEquivCents,
      render: (r) => (
        <span
          className={
            r.usdEquivCents > APPROVAL_THRESHOLD_USD_CENTS
              ? "font-semibold text-destructive"
              : ""
          }
        >
          {formatMoney(r.usdEquivCents, "USD")}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      value: (r) => r.status,
      render: (r) => <StatusBadge status={r.status} />,
    },
    {
      key: "requestedBy",
      header: "Requested by",
      value: (r) => r.requestedByEmail,
      render: (r) => r.requestedByEmail,
    },
    {
      key: "created",
      header: "Created",
      value: (r) => new Date(r.createdAt).toISOString().slice(0, 10),
      render: (r) => new Date(r.createdAt).toISOString().slice(0, 10),
    },
  ];

  return (
    <>
      {can.create && (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            New refund request
          </Button>
        </div>
      )}
      <DataTable
        columns={columns}
        rows={rows}
        onRowClick={(r) => {
          setOpenId(r.id);
          setRejectReason("");
          setMessage(null);
          setNotice(null);
        }}
      />

      <DetailDrawer
        open={!!detail}
        onClose={() => setOpenId(null)}
        title={detail ? `Refund ${detail.externalRef}` : ""}
      >
        {detail && (
          <div className="space-y-6">
            <div className="flex items-center gap-3">
              <StatusBadge status={detail.status} />
              <span className="text-sm text-muted-foreground">
                {formatMoney(detail.amountCents, detail.currency)} ·{" "}
                {formatMoney(detail.usdEquivCents, "USD")} equiv
              </span>
            </div>

            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Customer (PII)</h3>
                {can.reveal && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={async () => {
                      const res = await revealPiiAction(detail.id);
                      if (res.ok && res.pii) {
                        setPii((p) => ({ ...p, [detail.id]: res.pii! }));
                      } else if (!res.ok) {
                        setMessage(res.error ?? "Reveal failed");
                      }
                    }}
                  >
                    Reveal PII (audited)
                  </Button>
                )}
              </div>
              <dl className="grid grid-cols-[8rem_1fr] gap-y-1 rounded-md border p-3 text-sm">
                <dt className="text-muted-foreground">Name</dt>
                <dd data-testid="pii-name">{effectivePii?.fullName}</dd>
                <dt className="text-muted-foreground">Email</dt>
                <dd data-testid="pii-email">{effectivePii?.email}</dd>
                <dt className="text-muted-foreground">Card</dt>
                <dd>•••• {detail.cardLast4}</dd>
                <dt className="text-muted-foreground">Transaction</dt>
                <dd className="font-mono text-xs">{detail.transactionId}</dd>
                <dt className="text-muted-foreground">Reason</dt>
                <dd>{detail.reasonCode}</dd>
                <dt className="text-muted-foreground">Requested by</dt>
                <dd>{detail.requestedByEmail}</dd>
                {detail.approvedByEmail && (
                  <>
                    <dt className="text-muted-foreground">Approved by</dt>
                    <dd>{detail.approvedByEmail}</dd>
                  </>
                )}
                {detail.rejectionReason && (
                  <>
                    <dt className="text-muted-foreground">Rejected because</dt>
                    <dd>{detail.rejectionReason}</dd>
                  </>
                )}
                {detail.paymentRef && (
                  <>
                    <dt className="text-muted-foreground">Payment ref</dt>
                    <dd className="font-mono text-xs">{detail.paymentRef}</dd>
                  </>
                )}
                <dt className="text-muted-foreground">Created</dt>
                <dd>
                  {new Date(detail.createdAt)
                    .toISOString()
                    .slice(0, 16)
                    .replace("T", " ")}
                </dd>
                {detail.decidedAt && (
                  <>
                    <dt className="text-muted-foreground">Decided</dt>
                    <dd>
                      {new Date(detail.decidedAt)
                        .toISOString()
                        .slice(0, 16)
                        .replace("T", " ")}
                    </dd>
                  </>
                )}
                {detail.paidAt && (
                  <>
                    <dt className="text-muted-foreground">Paid</dt>
                    <dd>
                      {new Date(detail.paidAt)
                        .toISOString()
                        .slice(0, 16)
                        .replace("T", " ")}
                    </dd>
                  </>
                )}
              </dl>
            </section>

            {message && <p className="text-sm text-destructive">{message}</p>}
            {notice && <p className="text-sm text-emerald-600">{notice}</p>}

            {detail.status === "pending_approval" && (
              <p className="rounded-md border p-3 text-sm text-muted-foreground">
                Awaiting decision by another finance_ops user in the approvals
                inbox.
              </p>
            )}

            {detail.status === "requested" &&
              (can.approve || can.reject) && (
                <section className="space-y-3 rounded-md border p-3">
                  {can.approve && (
                    <Button
                      size="sm"
                      disabled={busy}
                      onClick={() => run(() => approveRefundAction(detail.id))}
                    >
                      Approve
                    </Button>
                  )}
                  {can.reject && (
                    <div className="flex items-start gap-2">
                      <Textarea
                        placeholder="Rejection reason (required)"
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                        aria-label="Rejection reason"
                      />
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={busy || !rejectReason.trim()}
                        onClick={() =>
                          run(() =>
                            rejectRefundAction(detail.id, rejectReason),
                          )
                        }
                      >
                        Reject
                      </Button>
                    </div>
                  )}
                </section>
              )}

            {detail.status === "approved" && can.markPaid && (
              <section className="rounded-md border p-3">
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={async () => {
                    const res = await run(() => markPaidAction(detail.id));
                    if (res.ok && res.paymentRef) {
                      setNotice(`Paid via ${res.paymentRef}`);
                    }
                  }}
                >
                  Mark as paid
                </Button>
              </section>
            )}
          </div>
        )}
      </DetailDrawer>

      <DetailDrawer
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="New refund request"
      >
        <div className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="customer-name">Customer name</Label>
            <Input
              id="customer-name"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="customer-email">Customer email</Label>
            <Input
              id="customer-email"
              type="email"
              value={customerEmail}
              onChange={(e) => setCustomerEmail(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="transaction-id">Original transaction ID</Label>
            <Input
              id="transaction-id"
              value={transactionId}
              onChange={(e) => setTransactionId(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="card-last4">Card last 4</Label>
            <Input
              id="card-last4"
              inputMode="numeric"
              maxLength={4}
              placeholder="1234"
              value={cardLast4}
              onChange={(e) =>
                setCardLast4(e.target.value.replace(/\D/g, "").slice(0, 4))
              }
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="amount">Amount</Label>
              <Input
                id="amount"
                inputMode="decimal"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="currency">Currency</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger id="currency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="refund-reason">Reason code</Label>
            <Select value={reasonCode} onValueChange={setReasonCode}>
              <SelectTrigger id="refund-reason">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REASON_CODES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {amountCents > 0 && (
            <p
              className={`text-sm ${willNeedApproval ? "text-destructive" : "text-muted-foreground"}`}
            >
              USD equivalent {formatMoney(usdEquiv, "USD")}
              {willNeedApproval
                ? " — will require approval by another finance_ops user"
                : ""}
            </p>
          )}

          {message && <p className="text-sm text-destructive">{message}</p>}
          {notice && <p className="text-sm text-emerald-600">{notice}</p>}

          <Button
            disabled={busy}
            onClick={async () => {
              const res = await run(() =>
                createRefundAction({
                  customerName,
                  customerEmail,
                  transactionId,
                  cardLast4,
                  amount: parseFloat(amount),
                  currency,
                  reasonCode,
                }),
              );
              if (res.ok) {
                setNotice(
                  res.pending
                    ? "Created and sent for approval (maker-checker)."
                    : "Refund request created.",
                );
                setCustomerName("");
                setCustomerEmail("");
                setTransactionId("");
                setCardLast4("");
                setAmount("");
                if (!res.pending) setCreateOpen(false);
              }
            }}
          >
            Submit refund request
          </Button>
        </div>
      </DetailDrawer>
    </>
  );
}

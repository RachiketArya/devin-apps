"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DataTable, type Column } from "@/platform/ui/data-table";
import { DetailDrawer } from "@/platform/ui/detail-drawer";
import { Badge } from "@/platform/ui/badge";
import { Button } from "@/platform/ui/button";
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
  addNoteAction,
  claimCaseAction,
  decideCaseAction,
  escalateCaseAction,
  revealPiiAction,
} from "@/apps/kyc/actions";
import { REASON_CODES, HIGH_RISK_THRESHOLD } from "@/apps/kyc/types";
import type { KycCaseDetail, KycQueueRow } from "@/apps/kyc/source";

interface Caps {
  claim: boolean;
  note: boolean;
  decide: boolean;
  escalate: boolean;
  reveal: boolean;
}

function StatusBadge({ status }: { status: string }) {
  const variant =
    status === "approved"
      ? "default"
      : status === "rejected"
        ? "destructive"
        : status === "escalated"
          ? "secondary"
          : "outline";
  return <Badge variant={variant}>{status}</Badge>;
}

export function QueueView({
  rows,
  details,
  can,
  userEmail,
}: {
  rows: KycQueueRow[];
  details: Record<string, KycCaseDetail>;
  can: Caps;
  userEmail: string;
}) {
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(null);
  const [pii, setPii] = useState<Record<string, KycCaseDetail["pii"]>>({});
  const [note, setNote] = useState("");
  const [reasonCode, setReasonCode] = useState<string>(REASON_CODES[0]);
  const [comment, setComment] = useState("");
  const [escalateReason, setEscalateReason] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const detail = openId ? details[openId] : null;
  const effectivePii = openId ? (pii[openId] ?? detail?.pii) : undefined;

  async function run<T extends { ok: boolean; error?: string }>(
    fn: () => Promise<T>,
  ): Promise<T> {
    setBusy(true);
    setMessage(null);
    const res = await fn();
    setBusy(false);
    if (!res.ok) setMessage(res.error ?? "Failed");
    else router.refresh();
    return res;
  }

  const columns: Column<KycQueueRow>[] = [
    {
      key: "ref",
      header: "Ref",
      value: (r) => r.externalRef,
      render: (r) => <span className="font-mono">{r.externalRef}</span>,
    },
    {
      key: "type",
      header: "Type",
      value: (r) => r.entityType,
      render: (r) => r.entityType,
    },
    {
      key: "risk",
      header: "Risk",
      value: (r) => r.riskScore,
      render: (r) => (
        <span className={r.riskScore >= 70 ? "font-semibold text-destructive" : ""}>
          {r.riskScore}
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
      key: "assignee",
      header: "Assignee",
      value: (r) => r.assigneeEmail ?? "",
      render: (r) => r.assigneeEmail ?? "—",
    },
    {
      key: "created",
      header: "Created",
      value: (r) => new Date(r.createdAt).toISOString().slice(0, 10),
      render: (r) => new Date(r.createdAt).toISOString().slice(0, 10),
    },
  ];

  const isDecided =
    detail && (detail.status === "approved" || detail.status === "rejected");

  return (
    <>
      <DataTable
        columns={columns}
        rows={rows}
        onRowClick={(r) => {
          setOpenId(r.id);
          setNote("");
          setComment("");
          setEscalateReason("");
          setMessage(null);
        }}
      />
      <DetailDrawer
        open={!!detail}
        onClose={() => setOpenId(null)}
        title={detail ? `Case ${detail.externalRef}` : ""}
      >
        {detail && (
          <div className="space-y-6">
            <div className="flex items-center gap-3">
              <StatusBadge status={detail.status} />
              <span className="text-sm text-muted-foreground">
                risk {detail.riskScore}
                {detail.riskScore >= HIGH_RISK_THRESHOLD &&
                  " — approvals need a senior analyst"}
              </span>
            </div>

            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Subject (PII)</h3>
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
              <dl className="grid grid-cols-[6rem_1fr] gap-y-1 rounded-md border p-3 text-sm">
                <dt className="text-muted-foreground">Name</dt>
                <dd data-testid="pii-name">{effectivePii?.fullName}</dd>
                <dt className="text-muted-foreground">Email</dt>
                <dd data-testid="pii-email">{effectivePii?.email}</dd>
                <dt className="text-muted-foreground">DOB</dt>
                <dd>{effectivePii?.dob ?? "—"}</dd>
                <dt className="text-muted-foreground">Address</dt>
                <dd>{effectivePii?.address ?? "—"}</dd>
                <dt className="text-muted-foreground">Tax ID</dt>
                <dd>{effectivePii?.taxId ?? "—"}</dd>
              </dl>
            </section>

            <section className="space-y-2">
              <h3 className="text-sm font-semibold">Documents</h3>
              <ul className="list-inside list-disc text-sm text-muted-foreground">
                {detail.documents.map((d) => (
                  <li key={d.id}>{d.fileName}</li>
                ))}
                {detail.documents.length === 0 && <li>none</li>}
              </ul>
            </section>

            {message && <p className="text-sm text-destructive">{message}</p>}

            {!isDecided && (
              <section className="space-y-3 rounded-md border p-3">
                <div className="flex flex-wrap gap-2">
                  {can.claim &&
                    detail.assigneeEmail !== userEmail && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => run(() => claimCaseAction(detail.id))}
                      >
                        Claim case
                      </Button>
                    )}
                  {can.escalate && detail.status !== "escalated" && (
                    <div className="flex w-full items-center gap-2">
                      <Textarea
                        placeholder="Escalation reason"
                        value={escalateReason}
                        onChange={(e) => setEscalateReason(e.target.value)}
                        className="min-h-10"
                        aria-label="Escalation reason"
                      />
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={busy || !escalateReason.trim()}
                        onClick={() =>
                          run(() =>
                            escalateCaseAction(detail.id, escalateReason),
                          )
                        }
                      >
                        Escalate
                      </Button>
                    </div>
                  )}
                </div>
                {can.decide && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Label htmlFor="reason-code" className="w-24 shrink-0">
                        Reason code
                      </Label>
                      <Select value={reasonCode} onValueChange={setReasonCode}>
                        <SelectTrigger id="reason-code" className="w-64">
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
                    <Textarea
                      placeholder="Comment (optional; reason shown on the approval request)"
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      aria-label="Decision comment"
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        disabled={busy}
                        onClick={async () => {
                          const res = await run(() =>
                            decideCaseAction({
                              caseId: detail.id,
                              decision: "approved",
                              reasonCode,
                              comment: comment || undefined,
                            }),
                          );
                          if (res.ok && res.pending) {
                            setMessage(
                              "Sent for senior_analyst approval (maker-checker).",
                            );
                          }
                        }}
                      >
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={busy}
                        onClick={() =>
                          run(() =>
                            decideCaseAction({
                              caseId: detail.id,
                              decision: "rejected",
                              reasonCode,
                              comment: comment || undefined,
                            }),
                          )
                        }
                      >
                        Reject
                      </Button>
                    </div>
                  </div>
                )}
              </section>
            )}

            <section className="space-y-2">
              <h3 className="text-sm font-semibold">Notes</h3>
              <ul className="space-y-2 text-sm">
                {detail.notes.map((n) => (
                  <li key={n.id} className="rounded-md bg-muted p-2">
                    <div className="text-xs text-muted-foreground">
                      {n.authorEmail} ·{" "}
                      {new Date(n.createdAt).toISOString().slice(0, 16).replace("T", " ")}
                    </div>
                    {n.body}
                  </li>
                ))}
                {detail.notes.length === 0 && (
                  <li className="text-muted-foreground">No notes yet.</li>
                )}
              </ul>
              {can.note && (
                <div className="flex items-start gap-2">
                  <Textarea
                    placeholder="Add a note"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    aria-label="Note"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy || !note.trim()}
                    onClick={() => run(() => addNoteAction(detail.id, note))}
                  >
                    Add
                  </Button>
                </div>
              )}
            </section>
          </div>
        )}
      </DetailDrawer>
    </>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/platform/ui/button";
import { Textarea } from "@/platform/ui/textarea";
import { decideApprovalAction } from "@/apps/kyc/actions";

export function ApprovalDecisionForm({ requestId }: { requestId: string }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function decide(decision: "approved" | "rejected") {
    setBusy(true);
    setMessage(null);
    const res = await decideApprovalAction(requestId, decision, reason);
    setBusy(false);
    if (res.ok) {
      router.refresh();
    } else {
      setMessage(res.error ?? "Failed");
    }
  }

  return (
    <div className="space-y-2">
      <Textarea
        placeholder="Decision reason (required)"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        aria-label="Decision reason"
      />
      {message && <p className="text-sm text-destructive">{message}</p>}
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={busy || !reason.trim()}
          onClick={() => decide("approved")}
        >
          Approve
        </Button>
        <Button
          size="sm"
          variant="destructive"
          disabled={busy || !reason.trim()}
          onClick={() => decide("rejected")}
        >
          Reject
        </Button>
      </div>
    </div>
  );
}

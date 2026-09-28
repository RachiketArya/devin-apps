"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Input } from "@/platform/ui/input";
import { Button } from "@/platform/ui/button";

export function AuditFilters() {
  const router = useRouter();
  const params = useSearchParams();
  const [actor, setActor] = useState(params.get("actor") ?? "");
  const [action, setAction] = useState(params.get("action") ?? "");
  const [entityType, setEntityType] = useState(params.get("entityType") ?? "");
  const [entityId, setEntityId] = useState(params.get("entityId") ?? "");

  function apply() {
    const q = new URLSearchParams();
    if (actor) q.set("actor", actor);
    if (action) q.set("action", action);
    if (entityType) q.set("entityType", entityType);
    if (entityId) q.set("entityId", entityId);
    router.push(`/audit?${q.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        placeholder="Actor email"
        value={actor}
        onChange={(e) => setActor(e.target.value)}
        className="w-48"
      />
      <Input
        placeholder="Action"
        value={action}
        onChange={(e) => setAction(e.target.value)}
        className="w-48"
      />
      <Input
        placeholder="Entity type"
        value={entityType}
        onChange={(e) => setEntityType(e.target.value)}
        className="w-40"
      />
      <Input
        placeholder="Entity id"
        value={entityId}
        onChange={(e) => setEntityId(e.target.value)}
        className="w-40"
      />
      <Button size="sm" onClick={apply}>
        Apply
      </Button>
    </div>
  );
}

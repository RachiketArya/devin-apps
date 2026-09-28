import { getSessionUser } from "@/platform/auth";
import { authorize } from "@/platform/authz/authorize";
import { listAuditEvents } from "@/platform/audit";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/platform/ui/table";
import { Badge } from "@/platform/ui/badge";
import { AuditFilters } from "./filters";

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await getSessionUser();
  if (!authorize(user, "audit:read")) {
    return <p className="text-muted-foreground">403 — missing audit:read</p>;
  }
  const params = await searchParams;
  const events = await listAuditEvents({
    actor: params.actor,
    action: params.action,
    entityType: params.entityType,
    entityId: params.entityId,
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Audit log</h1>
      <AuditFilters />
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Time (UTC)</TableHead>
              <TableHead>Actor</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Entity</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead>Diff</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {events.map((e) => (
              <TableRow key={e.id}>
                <TableCell className="whitespace-nowrap text-xs">
                  {e.createdAt.toISOString().replace("T", " ").slice(0, 19)}
                </TableCell>
                <TableCell className="text-xs">{e.actor.email}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{e.actorRole}</Badge>
                </TableCell>
                <TableCell className="font-mono text-xs">{e.action}</TableCell>
                <TableCell className="text-xs">
                  {e.entityType}:{e.entityId.slice(-6)}
                </TableCell>
                <TableCell className="max-w-40 truncate text-xs">
                  {e.reason ?? "—"}
                </TableCell>
                <TableCell className="max-w-64">
                  <details>
                    <summary className="cursor-pointer text-xs text-muted-foreground">
                      before → after
                    </summary>
                    <pre className="mt-1 overflow-x-auto text-[10px]">
                      {e.before ?? "null"} {"\n→ "}
                      {e.after ?? "null"}
                    </pre>
                  </details>
                </TableCell>
              </TableRow>
            ))}
            {events.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="py-8 text-center text-muted-foreground"
                >
                  No audit events match.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

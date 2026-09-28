import { db } from "@/platform/db";

export interface AuditFilter {
  actor?: string;
  action?: string;
  entityType?: string;
  entityId?: string;
}

export async function listAuditEvents(filter: AuditFilter, limit = 200) {
  return db.auditEvent.findMany({
    where: {
      actor: filter.actor
        ? { email: { contains: filter.actor } }
        : undefined,
      action: filter.action ? { contains: filter.action } : undefined,
      entityType: filter.entityType || undefined,
      entityId: filter.entityId || undefined,
    },
    include: { actor: { select: { email: true, name: true } } },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

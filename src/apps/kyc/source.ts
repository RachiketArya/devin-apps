import type { Tx } from "@/platform/db";

/**
 * Case data lives behind this small interface. The local implementation reads
 * the seeded Prisma tables; production can swap in an implementation backed by
 * the company's real KYC system without touching the service layer — only this
 * file and the registry change.
 */

export interface KycQueueRow {
  id: string;
  externalRef: string;
  entityType: string;
  riskScore: number;
  status: string;
  assigneeEmail: string | null;
  createdAt: Date;
}

export interface KycCasePii {
  fullName: string;
  email: string;
  dob: string | null;
  address: string | null;
  taxId: string | null;
}

export interface KycCaseDetail extends KycQueueRow {
  updatedAt: Date;
  documents: { id: string; fileName: string; uploadedAt: Date }[];
  notes: {
    id: string;
    body: string;
    authorEmail: string;
    createdAt: Date;
  }[];
  pii: KycCasePii;
}

export interface KycCaseSource {
  listQueue(db: Pick<Tx, "kycCase">): Promise<KycQueueRow[]>;
  getCase(
    db: Pick<Tx, "kycCase" | "kycNote" | "kycDocument">,
    id: string,
  ): Promise<KycCaseDetail | null>;
}

type CaseRow = {
  id: string;
  externalRef: string;
  entityType: string;
  riskScore: number;
  status: string;
  assignee: { email: string } | null;
  createdAt: Date;
};

function toQueueRow(c: CaseRow): KycQueueRow {
  return {
    id: c.id,
    externalRef: c.externalRef,
    entityType: c.entityType,
    riskScore: c.riskScore,
    status: c.status,
    assigneeEmail: c.assignee?.email ?? null,
    createdAt: c.createdAt,
  };
}

export class PrismaKycCaseSource implements KycCaseSource {
  async listQueue(db: Pick<Tx, "kycCase">): Promise<KycQueueRow[]> {
    const cases = await db.kycCase.findMany({
      include: { assignee: { select: { email: true } } },
      orderBy: [{ status: "asc" }, { riskScore: "desc" }, { createdAt: "asc" }],
    });
    return cases.map(toQueueRow);
  }

  async getCase(
    db: Pick<Tx, "kycCase" | "kycNote" | "kycDocument">,
    id: string,
  ): Promise<KycCaseDetail | null> {
    const c = await db.kycCase.findUnique({
      where: { id },
      include: {
        assignee: { select: { email: true } },
        documents: { orderBy: { uploadedAt: "asc" } },
        notes: {
          include: { author: { select: { email: true } } },
          orderBy: { createdAt: "desc" },
        },
      },
    });
    if (!c) return null;
    return {
      ...toQueueRow(c),
      updatedAt: c.updatedAt,
      documents: c.documents.map((d) => ({
        id: d.id,
        fileName: d.fileName,
        uploadedAt: d.uploadedAt,
      })),
      notes: c.notes.map((n) => ({
        id: n.id,
        body: n.body,
        authorEmail: n.author.email,
        createdAt: n.createdAt,
      })),
      pii: {
        fullName: c.piiFullName,
        email: c.piiEmail,
        dob: c.piiDob,
        address: c.piiAddress,
        taxId: c.piiTaxId,
      },
    };
  }
}

export const kycCaseSource: KycCaseSource = new PrismaKycCaseSource();

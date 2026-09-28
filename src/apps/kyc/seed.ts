import type { Tx } from "@/platform/db";

const FIRST = [
  "Amara", "Boris", "Chen", "Dalia", "Elias", "Fatima", "Goran", "Hana",
  "Ivan", "Jia", "Kofi", "Lena", "Mateo", "Nadia", "Omar",
];
const LAST = [
  "Okafor", "Petrov", "Wei", "Haddad", "Novak", "Diallo", "Markovic", "Sato",
  "Petrenko", "Li", "Mensah", "Johansson", "Vega", "Aziz", "Farouk",
];
const COMPANIES = [
  "Nordwind Trading GmbH", "Bluefin Logistics Ltd", "Caspian Textiles Co",
  "Meridian Freight SAS", "Solstice Minerals Inc", "Harborline Imports BV",
  "Quartz & Pine Holdings", "Tundra Foods OY", "Vantage Maritime SA",
  "Ember Peak Ventures",
];
const DOCS = [
  "passport.pdf",
  "proof_of_address.pdf",
  "bank_statement_q2.pdf",
  "certificate_of_incorporation.pdf",
  "ubo_declaration.pdf",
  "tax_residency.pdf",
];

/** Deterministic ~30-case seed: individuals and businesses, mixed risk/status. */
export async function seed(tx: Tx) {
  const users = await tx.user.findMany();
  const analyst = users.find((u) => u.role === "analyst");
  const senior = users.find((u) => u.role === "senior_analyst");
  const assignees = [analyst?.id ?? null, senior?.id ?? null, null];
  const statuses = [
    "new", "new", "new", "in_review", "in_review",
    "escalated", "approved", "rejected",
  ];

  const cases: string[] = [];
  for (let i = 0; i < 30; i++) {
    const isBusiness = i % 3 === 2;
    const name = isBusiness
      ? COMPANIES[Math.floor(i / 3) % COMPANIES.length]
      : `${FIRST[i % FIRST.length]} ${LAST[(i * 7) % LAST.length]}`;
    const riskScore = (i * 37) % 101;
    const status = statuses[i % statuses.length];
    const assigned =
      status === "in_review" || status === "approved" || status === "rejected"
        ? assignees[i % assignees.length]
        : null;

    const kycCase = await tx.kycCase.create({
      data: {
        externalRef: `KYC-${1001 + i}`,
        entityType: isBusiness ? "business" : "individual",
        riskScore,
        status,
        assigneeId: assigned,
        piiFullName: name,
        piiEmail: `subject${i}@example.com`,
        piiDob: isBusiness ? null : `19${70 + (i % 30)}-0${(i % 9) + 1}-1${i % 9}`,
        piiAddress: `${10 + i} Fictional Ave, Springfield`,
        piiTaxId: `TAX-${String(100000 + i * 977)}`,
      },
    });
    cases.push(kycCase.id);

    const docCount = 1 + (i % 3);
    for (let d = 0; d < docCount; d++) {
      await tx.kycDocument.create({
        data: {
          caseId: kycCase.id,
          fileName: DOCS[(i + d) % DOCS.length],
        },
      });
    }
  }
  return cases;
}

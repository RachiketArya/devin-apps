import type { Tx } from "@/platform/db";
import { toUsdCents, type Currency } from "@/apps/refunds/types";

const FIRST = [
  "Amara", "Boris", "Chen", "Dalia", "Elias", "Fatima", "Goran", "Hana",
  "Ivan", "Jia", "Kofi", "Lena", "Mateo", "Nadia", "Omar",
];
const LAST = [
  "Okafor", "Petrov", "Wei", "Haddad", "Novak", "Diallo", "Markovic", "Sato",
  "Petrenko", "Li", "Mensah", "Johansson", "Vega", "Aziz", "Farouk",
];
const REASONS = [
  "duplicate_charge",
  "fraud_suspected",
  "service_not_received",
  "item_not_received",
  "customer_request",
  "other",
];
const CURRENCIES: Currency[] = ["USD", "EUR", "GBP"];

/** Second finance_ops user so maker-checker can be exercised end to end. */
const EXTRA_FINANCE = {
  email: "finance2@dev.local",
  name: "Fiona Finance",
  role: "finance_ops",
};

/**
 * Deterministic ~40-request seed across 3 currencies and every status.
 * pending_approval rows get a real pending ApprovalRequest (requested by
 * finance@dev.local) so /approvals and the derived status work on real data.
 */
export async function seed(tx: Tx) {
  const finance2 = await tx.user.upsert({
    where: { email: EXTRA_FINANCE.email },
    update: { name: EXTRA_FINANCE.name, role: EXTRA_FINANCE.role },
    create: EXTRA_FINANCE,
  });
  const users = await tx.user.findMany();
  const finance = users.find((u) => u.email === "finance@dev.local")!;

  const statuses = [
    "requested",
    "requested",
    "pending_approval",
    "approved",
    "approved",
    "rejected",
    "paid",
    "paid",
  ] as const;

  for (let i = 0; i < 40; i++) {
    const name = `${FIRST[i % FIRST.length]} ${LAST[(i * 7) % LAST.length]}`;
    const currency = CURRENCIES[i % CURRENCIES.length];
    const status = statuses[i % statuses.length];
    // Amounts $40–$4,000-ish; pending_approval rows always exceed the
    // USD threshold, requested rows never do (creation routes them).
    let amountCents = 4_000 + ((i * 7_931) % 396_000);
    if (
      status === "pending_approval" &&
      toUsdCents(amountCents, currency) <= 50_000
    ) {
      amountCents = { USD: 75_000, EUR: 60_000, GBP: 50_000 }[currency];
    }
    if (status === "requested" && toUsdCents(amountCents, currency) > 50_000) {
      amountCents = 25_000;
    }

    const requester = i % 2 === 0 ? finance : finance2;
    const approver = requester.id === finance.id ? finance2 : finance;
    const daysAgo = i % 14;
    const created = new Date(Date.now() - daysAgo * 86_400_000);

    const refund = await tx.refundRequest.create({
      data: {
        externalRef: `RFD-${1001 + i}`,
        transactionId: `txn_${(9_000_000 + i * 41_237).toString(36)}`,
        cardLast4: String(1000 + ((i * 2_713) % 9_000)),
        amountCents,
        currency,
        usdEquivCents: toUsdCents(amountCents, currency),
        reasonCode: REASONS[i % REASONS.length],
        status,
        requestedById: requester.id,
        requestedByEmail: requester.email,
        approvedById: status === "approved" || status === "paid" ? approver.id : null,
        approvedByEmail:
          status === "approved" || status === "paid" ? approver.email : null,
        decidedAt:
          status === "approved" || status === "rejected" || status === "paid"
            ? created
            : null,
        rejectionReason:
          status === "rejected" ? "Could not verify original charge" : null,
        paymentRef: status === "paid" ? `MOCKPAY-SEED${1001 + i}` : null,
        paidAt: status === "paid" ? created : null,
        piiFullName: name,
        piiEmail: `customer${i}@example.com`,
        createdAt: created,
      },
    });

    if (status === "pending_approval") {
      const request = await tx.approvalRequest.create({
        data: {
          toolKey: "refunds",
          actionKey: "refunds.refund.approve",
          approverPermission: "refunds:approve-request",
          payload: JSON.stringify({ refundRequestId: refund.id }),
          requesterId: requester.id,
          reason: `USD equivalent exceeds $500 threshold`,
          status: "pending",
          createdAt: created,
        },
      });
      await tx.refundRequest.update({
        where: { id: refund.id },
        data: { approvalRequestId: request.id },
      });
    }
  }
}

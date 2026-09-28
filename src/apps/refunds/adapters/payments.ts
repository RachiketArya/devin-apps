/**
 * PaymentsGateway — the seam between the refunds tool and the real payment
 * processor. The mock below returns a deterministic fake reference and never
 * moves money; production swaps in a client for the real gateway without
 * touching the service layer.
 */
export interface RefundPayment {
  transactionId: string;
  amountCents: number;
  currency: string;
  cardLast4: string;
}

export interface PaymentsGateway {
  /** Issue the refund to the customer's card; returns the gateway reference. */
  refund(payment: RefundPayment): Promise<{ reference: string }>;
}

export class MockPaymentsGateway implements PaymentsGateway {
  async refund(payment: RefundPayment): Promise<{ reference: string }> {
    const txFragment = payment.transactionId
      .replace(/[^a-zA-Z0-9]/g, "")
      .slice(-8)
      .toUpperCase();
    return { reference: `MOCKPAY-${txFragment}-${payment.cardLast4}` };
  }
}

export const paymentsGateway: PaymentsGateway = new MockPaymentsGateway();

export type AsaasWebhookEvent =
  | { event: 'PAYMENT_RECEIVED'; payment: { subscriptionId: string } }
  | { event: 'PAYMENT_OVERDUE'; payment: { subscriptionId: string } }
  | { event: 'SUBSCRIPTION_CREATED'; subscription: { id: string } }
  | { event: 'SUBSCRIPTION_CANCELLED'; subscription: { id: string } };

export interface BillingEvent {
  type: 'payment.succeeded' | 'payment.failed' | 'subscription.activated' | 'subscription.cancelled';
  subscriptionId: string;
}

export function parseAsaasWebhook(payload: AsaasWebhookEvent): BillingEvent | null {
  switch (payload.event) {
    case 'PAYMENT_RECEIVED':
      return { type: 'payment.succeeded', subscriptionId: payload.payment.subscriptionId };
    case 'PAYMENT_OVERDUE':
      return { type: 'payment.failed', subscriptionId: payload.payment.subscriptionId };
    case 'SUBSCRIPTION_CREATED':
      return { type: 'subscription.activated', subscriptionId: payload.subscription.id };
    case 'SUBSCRIPTION_CANCELLED':
      return { type: 'subscription.cancelled', subscriptionId: payload.subscription.id };
    default:
      return null;
  }
}

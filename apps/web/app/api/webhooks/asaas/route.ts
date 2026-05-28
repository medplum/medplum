import { NextRequest, NextResponse } from 'next/server';
import { parseAsaasWebhook } from '@hh/billing';

export async function POST(req: NextRequest) {
  const secret = req.headers.get('asaas-access-token');
  if (secret !== process.env.WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const payload = await req.json();
  const event = parseAsaasWebhook(payload);

  if (!event) {
    return NextResponse.json({ ok: true });
  }

  switch (event.type) {
    case 'subscription.activated':
      // TODO: update ProjectSetting subscription_status = 'active'
      console.log('Subscription activated:', event.subscriptionId);
      break;
    case 'subscription.cancelled':
      // TODO: update ProjectSetting subscription_status = 'cancelled'
      console.log('Subscription cancelled:', event.subscriptionId);
      break;
    case 'payment.failed':
      // TODO: update ProjectSetting subscription_status = 'past_due'
      console.log('Payment failed:', event.subscriptionId);
      break;
  }

  return NextResponse.json({ ok: true });
}

import { NextRequest, NextResponse } from 'next/server';
import { parseInboundIntent } from '@hh/whatsapp';

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-webhook-secret');
  if (secret !== process.env.WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const payload = await req.json();

  // Evolution API message structure
  const text: string = payload?.data?.message?.conversation ?? '';
  const from: string = payload?.data?.key?.remoteJid?.replace('@s.whatsapp.net', '') ?? '';

  if (!text || !from) {
    return NextResponse.json({ ok: true });
  }

  const intent = parseInboundIntent(text);

  switch (intent) {
    case 'confirm':
      // TODO: find appointment by phone + pending status, update to confirmed
      // TODO: send appointmentConfirmed template back
      console.log('Confirm from', from);
      break;
    case 'reschedule':
      // TODO: flag appointment, notify receptionist
      console.log('Reschedule from', from);
      break;
    case 'cancel':
      // TODO: cancel appointment
      console.log('Cancel from', from);
      break;
    default:
      // TODO: send fallback message
      break;
  }

  return NextResponse.json({ ok: true });
}

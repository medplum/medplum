import { BotEvent, MedplumClient } from '@medplum/core';
import { createHmac } from 'crypto';
import { PhotonWebhook } from './../photon-types';

export async function handler(_medplum: MedplumClient, event: BotEvent<PhotonWebhook>): Promise<void> {
  const webhook = event.input;
  // You will need to set up the webhook secret in your Medplum project. Per the photon docs, if there is no secret, an empty string should be used.
  const PHOTON_WEBHOOK_SECRET = event.secrets['PHOTON_WEBHOOK_SECRET']?.valueString ?? '';

  // Ensure the webhook is coming from Photon
  const isValid = verifyEvent(webhook, PHOTON_WEBHOOK_SECRET);
  if (!isValid) {
    throw new Error('Not a valid Photon Webhook Event');
  }
}

// Verify the event per the Photon docs: https://docs.photon.health/docs/webhook-signature-verification#verifying-the-webhook
export function verifyEvent(photonEvent: PhotonWebhook, secret: string): boolean {
  const signature = photonEvent.headers['X-Photon-Signature'];
  const body = photonEvent.body;

  const hmac = createHmac('sha256', secret);
  const digest = hmac.update(JSON.stringify(body)).digest('hex');

  return digest === signature;
}

import { allOk, parseJWTPayload } from '@medplum/core';
import { Parameters } from '@medplum/fhirtypes';
import { Request, Response } from 'express';
import crypto from 'node:crypto';
import { getConfig } from '../../config';
import { getRedis } from '../../redis';
import { sendResponse } from '../routes';

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

/**
 * Handles a GetWsBindingToken request.
 *
 * Endpoint - Binding Token for WebSocket Subscription connection.
 *
 *   URL: [base]/Subscription/$get-ws-binding-token
 *
 *   URL: [base]/Subscription/[id]/$get-ws-binding-token
 *
 * See: https://build.fhir.org/subscription-operation-get-ws-binding-token.html
 * @param req - The HTTP request.
 * @param res - The HTTP response.
 */
export async function getWsBindingTokenHandler(req: Request, res: Response): Promise<void> {
  const { baseUrl } = getConfig();
  const redis = getRedis();

  const accessToken = (req.headers.authorization as string).replace('Bearer ', '').trim();
  const tokenPayload = parseJWTPayload(accessToken);
  // Create params to send back
  const tokenParams = {
    resourceType: 'Parameters',
    parameter: [
      {
        name: 'token',
        valueString: accessToken,
      },
      {
        name: 'expiration',
        valueDateTime: new Date(
          (typeof tokenPayload.exp === 'string' ? parseInt(tokenPayload.exp, 10) : tokenPayload.exp) * 1000
        ).toISOString(),
      },
      {
        name: 'websocket-url',
        valueUrl: `${baseUrl.replace('http://', 'ws://').replace('https://', 'wss://')}ws/subscriptions-r4`,
      },
    ],
  } satisfies Parameters;

  // Create tentative binding for this user
  // When user connects to WebSocket, get all of the tentative bindings
  const subscriptionId = req.params.id;
  const bindingsKey = `::subscriptions/r4::bindings::${textDecoder.decode(
    await crypto.subtle.digest('sha-256', textEncoder.encode(accessToken))
  )}`;
  const existingBindings = await redis.get(bindingsKey);
  if (!existingBindings) {
    await redis.set(bindingsKey, subscriptionId);
  } else if (!existingBindings.includes(subscriptionId)) {
    // Check if we already have this subscription in the bindings
    await redis.set(bindingsKey, `${existingBindings},${subscriptionId}`);
  }
  await sendResponse(res, allOk, tokenParams);
}

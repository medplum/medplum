import { allOk, badRequest, createReference, parseJWTPayload } from '@medplum/core';
import { Parameters } from '@medplum/fhirtypes';
import { Request, Response } from 'express';
import { getConfig } from '../../config';
import { getAuthenticatedContext } from '../../context';
import { getAuthTokens } from '../../oauth/utils';
import { getRedis } from '../../redis';
import { sendOutcome } from '../outcomes';
import { sendResponse } from '../routes';

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
  const { login, membership, profile, accessToken } = getAuthenticatedContext();
  const { baseUrl } = getConfig();
  const redis = getRedis();
  const loginId = login.id as string;

  let token: string;
  if (!accessToken) {
    const tokens = await getAuthTokens(
      {
        ...login,
        membership: createReference(membership),
      },
      profile
    );
    token = tokens.accessToken;
  } else {
    token = accessToken;
  }

  const tokenPayload = parseJWTPayload(token);

  // Create params to send back
  const tokenParams = {
    resourceType: 'Parameters',
    parameter: [
      {
        name: 'token',
        valueString: token,
      },
      {
        name: 'expiration',
        valueDateTime: new Date((tokenPayload.exp as number) * 1000).toISOString(),
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
  const subExists = await redis.exists(`Subscription/${subscriptionId}`);
  if (!subExists) {
    await sendOutcome(res, badRequest('Content could not be parsed'));
    return;
  }
  await redis.sadd(`::subscriptions/r4::bindings::${loginId}`, subscriptionId);
  await sendResponse(res, allOk, tokenParams);
}

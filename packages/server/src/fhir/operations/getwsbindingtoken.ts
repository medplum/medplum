import { allOk, badRequest, normalizeErrorString, resolveId } from '@medplum/core';
import { Parameters, Subscription } from '@medplum/fhirtypes';
import { Request, Response } from 'express';
import { getConfig } from '../../config';
import { getAuthenticatedContext } from '../../context';
import { generateAccessToken } from '../../oauth/keys';
import { sendOutcome } from '../outcomes';
import { sendResponse } from '../response';

const ONE_HOUR = 60 * 60 * 1000;

export type AdditionalWsBindingClaims = {
  subscription_id: string;
};

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
  const { login, profile, repo, project } = getAuthenticatedContext();
  const { baseUrl } = getConfig();

  if (!project.features?.includes('websocket-subscriptions')) {
    sendOutcome(res, badRequest('WebSocket subscriptions not enabled for current project'));
    return;
  }

  const clientId = login.client && resolveId(login.client);
  const userId = resolveId(login.user);
  if (!userId) {
    sendOutcome(res, badRequest('Login missing user'));
    return;
  }

  const subscriptionId = req.params.id;
  try {
    await repo.readResource<Subscription>('Subscription', subscriptionId);
  } catch (err: unknown) {
    sendOutcome(res, badRequest(`Error reading subscription: ${normalizeErrorString(err)}`));
    return;
  }

  const token = await generateAccessToken(
    {
      client_id: clientId,
      login_id: login.id as string,
      sub: userId,
      username: userId,
      scope: login.scope as string,
      profile: profile.reference as string,
    },
    {
      subscription_id: subscriptionId,
    } satisfies AdditionalWsBindingClaims
  );

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
        valueDateTime: new Date(Date.now() + ONE_HOUR).toISOString(),
      },
      {
        name: 'websocket-url',
        valueUrl: `${baseUrl.replace('http://', 'ws://').replace('https://', 'wss://')}ws/subscriptions-r4`,
      },
    ],
  } satisfies Parameters;

  await sendResponse(req, res, allOk, tokenParams);
}

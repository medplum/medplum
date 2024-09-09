import { allOk, badRequest, normalizeErrorString, resolveId } from '@medplum/core';
import { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import { OperationDefinition, Subscription } from '@medplum/fhirtypes';
import { getConfig } from '../../config';
import { getAuthenticatedContext } from '../../context';
import { generateAccessToken } from '../../oauth/keys';
import { buildOutputParameters } from './utils/parameters';

const ONE_HOUR = 60 * 60 * 1000;

export type AdditionalWsBindingClaims = {
  subscription_id: string;
};

// Source (for backport version): https://build.fhir.org/ig/HL7/fhir-subscription-backport-ig/OperationDefinition-backport-subscription-get-ws-binding-token.json.html
// R5 definition: https://build.fhir.org/operation-subscription-get-ws-binding-token.json.html
const operation: OperationDefinition = {
  resourceType: 'OperationDefinition',
  id: 'backport-subscription-get-ws-binding-token',
  extension: [
    {
      url: 'http://hl7.org/fhir/StructureDefinition/structuredefinition-fmm',
      valueInteger: 0,
    },
    {
      url: 'http://hl7.org/fhir/StructureDefinition/structuredefinition-standards-status',
      valueCode: 'trial-use',
    },
    {
      url: 'http://hl7.org/fhir/StructureDefinition/structuredefinition-wg',
      valueCode: 'fhir',
    },
  ],
  url: 'http://hl7.org/fhir/uv/subscriptions-backport/OperationDefinition/backport-subscription-get-ws-binding-token',
  version: '1.2.0-ballot',
  name: 'R5SubscriptionGetWsBindingToken',
  title: 'Get WS Binding Token for Subscription Operation',
  status: 'active',
  kind: 'operation',
  date: '2020-11-30',
  publisher: 'HL7 International / FHIR Infrastructure',
  contact: [
    {
      name: 'HL7 International / FHIR Infrastructure',
      telecom: [
        {
          system: 'url',
          value: 'http://www.hl7.org/Special/committees/fiwg',
        },
      ],
    },
    {
      name: 'Gino Canessa',
      telecom: [
        {
          system: 'email',
          value: 'mailto:gino.canessa@microsoft.com',
        },
      ],
    },
  ],
  description:
    'This operation is used to get a token for a websocket client to use in order to bind to one or more subscriptions.',
  jurisdiction: [
    {
      coding: [
        {
          system: 'http://unstats.un.org/unsd/methods/m49/m49.htm',
          code: '001',
          display: 'World',
        },
      ],
    },
  ],
  affectsState: false,
  code: 'get-ws-binding-token',
  resource: ['Subscription'],
  system: false,
  type: true,
  instance: true,
  parameter: [
    {
      name: 'id',
      use: 'in',
      min: 0,
      max: '*',
      documentation:
        'At the Instance level, this parameter is ignored. At the Resource level, one or more parameters containing a FHIR id for a Subscription to get a token for. In the absense of any specified ids, the server may either return a token for all Subscriptions available to the caller with a channel-type of websocket or fail the request.',
      type: 'id',
    },
    {
      name: 'token',
      use: 'out',
      min: 1,
      max: '1',
      documentation: 'An access token that a client may use to show authorization during a websocket connection.',
      type: 'string',
    },
    {
      name: 'expiration',
      use: 'out',
      min: 1,
      max: '1',
      documentation: 'The date and time this token is valid until.',
      type: 'dateTime',
    },
    {
      name: 'subscription',
      use: 'out',
      min: 0,
      max: '*',
      documentation: 'The subscriptions this token is valid for.',
      type: 'string',
    },
    {
      name: 'websocket-url',
      use: 'out',
      min: 1,
      max: '1',
      documentation: 'The URL the client should use to connect to Websockets.',
      type: 'url',
    },
  ],
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
 * @param req - The FHIR request.
 * @returns The FHIR response.
 */
export async function getWsBindingTokenHandler(req: FhirRequest): Promise<FhirResponse> {
  const { login, profile, repo, project } = getAuthenticatedContext();
  const { baseUrl } = getConfig();

  if (!project.features?.includes('websocket-subscriptions')) {
    return [badRequest('WebSocket subscriptions not enabled for current project')];
  }

  const clientId = login.client && resolveId(login.client);
  const userId = resolveId(login.user);
  if (!userId) {
    return [badRequest('Login missing user')];
  }

  const { id: subscriptionId } = req.params;

  try {
    await repo.readResource<Subscription>('Subscription', subscriptionId);
  } catch (err: unknown) {
    return [badRequest(`Error reading subscription: ${normalizeErrorString(err)}`)];
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

  const output = {
    token,
    expiration: new Date(Date.now() + ONE_HOUR).toISOString(),
    subscription: subscriptionId,
    'websocket-url': `${baseUrl.replace('http://', 'ws://').replace('https://', 'wss://')}ws/subscriptions-r4`,
  };

  return [allOk, buildOutputParameters(operation, output)];
}

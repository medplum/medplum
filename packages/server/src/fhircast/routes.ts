// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type {
  CurrentContext,
  FhircastAnchorResourceType,
  FhircastDiagnosticReportCloseContext,
  FhircastDiagnosticReportOpenContext,
  FhircastEventPayload,
  FhircastMessagePayload,
} from '@medplum/core';
import {
  append,
  badRequest,
  EMPTY,
  generateId,
  getWebSocketUrl,
  isResource,
  normalizeErrorString,
  OperationOutcomeError,
  resolveId,
  serverError,
  singularize,
} from '@medplum/core';
import type { Bundle, BundleEntry, Resource } from '@medplum/fhirtypes';
import type { Request, Response } from 'express';
import { Router } from 'express';
import { body, oneOf, validationResult } from 'express-validator';
import { getConfig } from '../config/loader';
import { getAuthenticatedContext } from '../context';
import { invalidRequest, sendOutcome } from '../fhir/outcomes';
import { getLogger } from '../logger';
import { authenticateRequest } from '../oauth/middleware';
import { publish } from '../pubsub';
import { getCacheRedis } from '../redis';
import {
  cleanupContextForResource,
  deleteEndpointSubscription,
  extractAnchorResourceType,
  extractEndpoint,
  FhircastVersion,
  getCurrentContext,
  getEndpointSubscription,
  getTopicContextStorageKey,
  getTopicCurrentContextKey,
  parseFhircastEvents,
  serializeFhircastChannelMessage,
  setEndpointSubscription,
  setTopicCurrentContext,
} from './utils';

export type EventCategory = 'open' | 'close' | 'update' | 'select' | 'other';

export function getEventCategory(eventName: string): EventCategory {
  const lower = eventName.toLowerCase();
  // `Home-open` represents the *lack* of a FHIR resource context, so it only borrows the
  // `-open` suffix and has no anchor resource to establish a current context from.
  // Source: https://build.fhir.org/ig/HL7/fhircast-docs/3-2-5-Home-open.html
  if (lower === 'home-open') {
    return 'other';
  }
  if (lower.endsWith('-open')) {
    return 'open';
  }
  if (lower.endsWith('-close')) {
    return 'close';
  }
  // `DiagnosticReport-update` is the only update event in the event catalog, so it's the only
  // one we handle today.
  // Source: https://build.fhir.org/ig/HL7/fhircast-docs/3-Events.html
  if (lower === 'diagnosticreport-update') {
    return 'update';
  }
  if (lower.endsWith('-select')) {
    return 'select';
  }
  return 'other';
}

const EVENT_HANDLERS: Record<EventCategory, (req: Request, res: Response) => Promise<void>> = {
  open: handleOpenContextChangeRequest,
  close: handleCloseContextChangeRequest,
  update: handleUpdateContextChangeRequest,
  select: handleOtherContextChangeRequest,
  other: handleOtherContextChangeRequest, // No-op for userlogout, heartbeat, etc.
};

export const fhircastSTU2Router = Router();
export const fhircastSTU3Router = Router();

const publicSTU2Routes = Router();
const publicSTU3Routes = Router();

fhircastSTU2Router.use(publicSTU2Routes);
fhircastSTU3Router.use(publicSTU3Routes);

const protectedCommonRoutes = Router().use(authenticateRequest);
fhircastSTU2Router.use(protectedCommonRoutes);
fhircastSTU3Router.use(protectedCommonRoutes);

const protectedSTU2Routes = Router();
const protectedSTU3Routes = Router();

fhircastSTU2Router.use(protectedSTU2Routes);
fhircastSTU3Router.use(protectedSTU3Routes);

const eventsSupported = [
  'syncerror',
  'heartbeat',
  'userlogout',
  'userhibernate',
  'Patient-open',
  'Patient-close',
  'ImagingStudy-open',
  'ImagingStudy-close',
  'Encounter-open',
  'Encounter-close',
  'DiagnosticReport-open',
  'DiagnosticReport-close',
  'DiagnosticReport-select',
  'DiagnosticReport-update',
];

publicSTU2Routes.get('/.well-known/fhircast-configuration', (_req: Request, res: Response) => {
  res.status(200).json({
    eventsSupported,
    websocketSupport: true,
    webhookSupport: false,
    fhircastVersion: 'STU2',
  });
});

publicSTU3Routes.get('/.well-known/fhircast-configuration', (_req: Request, res: Response) => {
  res.status(200).json({
    eventsSupported,
    getCurrentSupport: true,
    websocketSupport: true,
    webhookSupport: false,
    fhircastVersion: 'STU3',
  });
});

// Register a new subscription
// Or publish an event depending on payload
// See: https://hl7.org/fhir/uv/fhircast/2024May/2-6-RequestContextChange.html#:~:text=Similar%20to%20the%20Hub%E2%80%99s%20notifications%20to%20the%20Subscriber%2C%20the%20Subscriber%20MAY%20request%20context%20changes%20with%20an%20HTTP%20POST%20to%20the%20hub.url
protectedCommonRoutes.post(
  '/',
  oneOf(
    [
      [
        body('id').notEmpty().withMessage('Missing event ID'),
        body('timestamp').notEmpty().withMessage('Missing event timestamp'),
        body('event').notEmpty().withMessage('Missing event payload'),
        body('event["hub.topic"]').notEmpty().withMessage('Missing event["hub.topic"]'),
        body('event["hub.event"]').notEmpty().withMessage('Missing event["hub.event"]'),
        body('event.context').notEmpty().withMessage('Missing event.context'),
      ],
      [
        body('hub.channel.type').notEmpty().withMessage('Missing hub.channel.type'),
        body('hub.mode').notEmpty().withMessage('Missing hub.mode'),
        body('hub.topic').notEmpty().withMessage('Missing hub.topic'),
        body('hub.events').notEmpty().withMessage('Missing hub.events'),
      ],
    ],
    { errorType: 'least_errored' }
  ),
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      sendOutcome(res, invalidRequest(errors));
      return;
    }

    // If there is an ID, this is a context change request
    if (req.body.id) {
      await handleContextChangeRequest(req, res);
      return;
    }
    // Otherwise it has to be a subscription request
    await handleSubscriptionRequest(req, res);
  }
);

// Publish an event to the hub topic
protectedCommonRoutes.post(
  '/:topic',
  [
    body('id').notEmpty().withMessage('Missing event ID'),
    body('timestamp').notEmpty().withMessage('Missing event timestamp'),
    body('event').notEmpty().withMessage('Missing event payload'),
    body('event["hub.topic"]').notEmpty().withMessage('Missing event["hub.topic"]'),
    body('event["hub.event"]').notEmpty().withMessage('Missing event["hub.event"]'),
    body('event.context').notEmpty().withMessage('Missing event.context'),
  ],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      sendOutcome(res, invalidRequest(errors));
      return;
    }
    await handleContextChangeRequest(req, res);
  }
);

/**
 * Returns which version of the spec a request came in on.
 *
 * The STU2 and STU3 routers share these handlers, so the mount path is what tells them apart. The
 * `/api/hub` alias serves STU3.
 * @param req - The request.
 * @returns The FHIRcast version this request was made against.
 */
function getFhircastVersion(req: Request): FhircastVersion {
  return req.baseUrl.includes(FhircastVersion.STU2) ? FhircastVersion.STU2 : FhircastVersion.STU3;
}

async function handleSubscriptionRequest(req: Request, res: Response): Promise<void> {
  const ctx = getAuthenticatedContext();

  const type = req.body['hub.channel.type'];
  if (type !== 'websocket') {
    sendOutcome(res, badRequest('Invalid hub.channel.type'));
    return;
  }

  const mode = req.body['hub.mode'] as 'subscribe' | 'unsubscribe';
  if (!(['subscribe', 'unsubscribe'] as const).includes(mode)) {
    sendOutcome(res, badRequest('Invalid hub.mode'));
    return;
  }

  const topic = req.body['hub.topic'];
  if (mode === 'unsubscribe') {
    await handleUnsubscribeRequest(req, res, topic);
    return;
  }

  // Every subscribe request gets its own endpoint, so that the Hub can tell apart subscribers
  // sharing a topic and remember the events each one asked for.
  const endpoint = generateId();
  try {
    await setEndpointSubscription(endpoint, {
      projectId: ctx.project.id,
      topic,
      events: parseFhircastEvents(req.body['hub.events']),
      version: getFhircastVersion(req),
    });
  } catch (err) {
    sendOutcome(res, serverError(new Error('Failed to create subscription for topic')));
    getLogger().error(`[FHIRcast]: Received error while creating subscription for topic`, {
      topic,
      error: normalizeErrorString(err),
    });
    return;
  }

  res.status(202).json({
    'hub.channel.endpoint': getWebSocketUrl(getConfig().baseUrl, `/ws/fhircast/${endpoint}`),
  });
}

async function handleUnsubscribeRequest(req: Request, res: Response, topic: string): Promise<void> {
  const ctx = getAuthenticatedContext();

  // Subscribers echo back the endpoint URL they were issued, which is what identifies the
  // subscription to cancel.
  const endpoint = extractEndpoint(req.body.endpoint);
  const subscription = endpoint ? await getEndpointSubscription(endpoint) : undefined;
  const ownsSubscription = subscription?.projectId === ctx.project.id && subscription?.topic === topic;

  if (endpoint && ownsSubscription) {
    await deleteEndpointSubscription(endpoint);
  }

  // The spec defines no body for an unsubscribe response, so echo the endpoint back only when the
  // request identified one
  res
    .status(202)
    .json(endpoint ? { 'hub.channel.endpoint': getWebSocketUrl(getConfig().baseUrl, `/ws/fhircast/${endpoint}`) } : {});

  publish(
    `${ctx.project.id}:${topic}`,
    serializeFhircastChannelMessage(
      {
        'hub.mode': 'denied',
        'hub.topic': topic,
        'hub.events': req.body['hub.events'],
        'hub.reason': 'Subscriber unsubscribed from topic',
      },
      // Deny only the unsubscribing socket when we know which one it is. A request without a usable
      // endpoint can only be honored by denying every subscriber on the topic.
      endpoint && ownsSubscription ? endpoint : undefined
    )
  ).catch((err: Error) => {
    getLogger().error(
      `[FHIRcast]: Error when publishing to Redis channel for FHIRcast topic: ${normalizeErrorString(err)}`,
      { topic }
    );
  });
}

async function handleContextChangeRequest(req: Request, res: Response): Promise<void> {
  const { event } = req.body as FhircastMessagePayload;
  const eventCategory = getEventCategory(event['hub.event']);
  await EVENT_HANDLERS[eventCategory](req, res);
}

async function handleOpenContextChangeRequest(req: Request, res: Response): Promise<void> {
  const ctx = getAuthenticatedContext();
  const { event } = req.body as FhircastMessagePayload<
    'DiagnosticReport-open' | 'Patient-open' | 'Encounter-open' | 'ImagingStudy-open'
  >;
  const projectId = ctx.project.id;

  const currentContext = await getCurrentContext(projectId, event['hub.topic']);
  // If the current context is a DiagnosticReport anchor context, then store it for later
  if (currentContext?.['context.type'] === 'DiagnosticReport') {
    const report = currentContext.context.find((ctx) => ctx.key === 'report')?.resource;
    if (!isResource(report, 'DiagnosticReport')) {
      sendOutcome(res, badRequest('No DiagnosticReport currently open for this topic'));
      return;
    }
    await storeContext(projectId, event['hub.topic'], report, currentContext);
  }

  // Separately, check if we already have a context for this DiagnosticReport
  // Check for existing contexts for this report
  const anchorReport = (event.context as FhircastDiagnosticReportOpenContext[]).find(
    (ctx) => ctx.key === 'report'
  )?.resource;
  if (anchorReport) {
    const storedContext = await fetchStoredContext(ctx.project.id, event['hub.topic'], anchorReport.id as string);
    if (storedContext) {
      await setTopicCurrentContext(projectId, event['hub.topic'], storedContext);
      event['context.versionId'] = storedContext['context.versionId'];
      await finalizeContextChangeRequest(res, projectId, req.body);
      return;
    }
  }
  // Else create a new context version ID
  event['context.versionId'] = generateId();

  const anchorResourceType = extractAnchorResourceType(event['hub.event']);
  if (anchorResourceType === 'DiagnosticReport') {
    await setTopicCurrentContext(projectId, event['hub.topic'], {
      'context.type': 'DiagnosticReport',
      context: [
        ...(event as FhircastEventPayload<'DiagnosticReport-open'>).context,
        // If a Hub supports content sharing, the Hub returns the current content in a content key in the context array.
        // There SHALL be one and only one Bundle resource which SHALL have a type of collection. No entry in the Bundle SHALL contain a request attribute.
        // The Bundle SHALL contain no entries if there is no content associated with the current context.
        // Source: https://build.fhir.org/ig/HL7/fhircast-docs/2-9-GetCurrentContext.html#content-sharing-support:~:text=If%20a%20Hub,the%20current%20context.
        {
          key: 'content',
          resource: { id: generateId(), resourceType: 'Bundle', type: 'collection' },
        },
      ],
      'context.versionId': event['context.versionId'],
    });
  } else {
    await setTopicCurrentContext(projectId, event['hub.topic'], {
      'context.type': anchorResourceType,
      context: event.context,
      'context.versionId': event['context.versionId'],
    } as unknown as CurrentContext<typeof anchorResourceType>);
  }
  await finalizeContextChangeRequest(res, projectId, req.body);
}

async function handleCloseContextChangeRequest(req: Request, res: Response): Promise<void> {
  const ctx = getAuthenticatedContext();
  const { event } = req.body as FhircastMessagePayload;
  const projectId = ctx.project.id;

  const report = (event.context as FhircastDiagnosticReportCloseContext[]).find(
    (ctx) => ctx.key === 'report'
  )?.resource;
  // We always close the current context, even if the event is not for the original resource... There isn't any mention of checking to see it's the right resource, so it seems it may be assumed to be always valid to do any arbitrary close as long as there is an existing context...
  await closeCurrentContext(projectId, event['hub.topic']);
  // If this is a DiagnosticReport-close, delete this context
  if (report) {
    await cleanupContextForResource(projectId, event['hub.topic'], report);
  }
  await finalizeContextChangeRequest(res, projectId, req.body);
}

// See: https://build.fhir.org/ig/HL7/fhircast-docs/3-6-3-DiagnosticReport-update.html
async function handleUpdateContextChangeRequest(req: Request, res: Response): Promise<void> {
  const ctx = getAuthenticatedContext();
  const { event } = req.body as FhircastMessagePayload;
  const projectId = ctx.project.id;

  const currentContext = await getCurrentContext(projectId, event['hub.topic']);
  if (currentContext?.['context.type'] !== 'DiagnosticReport') {
    sendOutcome(res, badRequest('No DiagnosticReport currently open for this topic'));
    return;
  }
  const priorVersionId = currentContext['context.versionId'];
  // Version mismatch we should return 400
  if (event['context.versionId'] !== priorVersionId) {
    sendOutcome(
      res,
      badRequest(
        `Expected event.context.versionId to be '${priorVersionId}', received ${event['context.versionId'] ? `'${event['context.versionId']}'` : 'empty event.context.versionId'}`
      )
    );
    return;
  }

  // We are just supposed to validate that the resources reference something that is valid
  // and then apply the updates to the content bundle for the current context
  const updates = event.context.find((ctx) => ctx.key === 'updates')?.resource;
  // Updates bundle required in the *-update event
  // See: https://build.fhir.org/ig/HL7/fhircast-docs/3-6-3-DiagnosticReport-update.html#:~:text=updates-,1..1,-resource
  if (!updates) {
    sendOutcome(res, badRequest('Update event requires an update bundle in the context'));
    return;
  }

  // This throws upon error
  processUpdateBundle(updates, currentContext);

  event['context.priorVersionId'] = priorVersionId;
  currentContext['context.versionId'] = event['context.versionId'] = generateId();
  // See: https://build.fhir.org/ig/HL7/fhircast-docs/2-10-ContentSharing.html
  await setTopicCurrentContext(projectId, event['hub.topic'], currentContext);
  await finalizeContextChangeRequest(res, projectId, req.body);
}

async function handleOtherContextChangeRequest(req: Request, res: Response): Promise<void> {
  const ctx = getAuthenticatedContext();
  await finalizeContextChangeRequest(res, ctx.project.id, req.body);
}

function processUpdateBundle(updatesBundle: Bundle, currentContext: CurrentContext<'DiagnosticReport'>): void {
  const contentBundle = currentContext.context.find((ctx) => ctx.key === 'content')?.resource as Bundle;
  for (const entry of updatesBundle?.entry ?? EMPTY) {
    // Only PUT and DELETE are supported
    // See: https://build.fhir.org/ig/HL7/fhircast-docs/StructureDefinition-fhircast-content-update-bundle.html
    switch (entry.request?.method) {
      case 'PUT': {
        // Throws upon failure to parse an entry
        processUpdateBundlePutEntry(entry, contentBundle);
        break;
      }
      case 'DELETE': {
        // Throws upon failure to parse an entry
        processUpdateBundleDeleteEntry(entry, contentBundle, currentContext);
        break;
      }
      case undefined: {
        throw new OperationOutcomeError(badRequest('Update bundle contains entry with a missing request.method'));
      }
      default:
        throw new OperationOutcomeError(
          badRequest(
            `Update bundle contains bad entry with request.method = '${entry.request?.method}', only 'PUT' and 'DELETE' are supported by an update event`
          )
        );
    }
  }
}

function processUpdateBundlePutEntry(entry: BundleEntry, contentBundle: Bundle): void {
  if (!entry.resource) {
    throw new OperationOutcomeError(badRequest('Missing resource in a update bundle PUT entry'));
  }
  const upsertedResource = entry.resource;
  const matchingIndex = contentBundle.entry?.findIndex((entry) => entry.resource?.id === upsertedResource.id);

  // Push it into bundle entry if it doesn't match anything existing in the content bundle
  if (matchingIndex === undefined || matchingIndex === -1) {
    contentBundle.entry = append(contentBundle.entry, { resource: upsertedResource });
  } else {
    // Replace the existing entry
    (contentBundle.entry as BundleEntry[])[matchingIndex].resource = upsertedResource;
  }
}

function processUpdateBundleDeleteEntry(
  entry: BundleEntry,
  contentBundle: Bundle,
  currentContext: CurrentContext<'DiagnosticReport'>
): void {
  // See profile for update bundle: https://build.fhir.org/ig/HL7/fhircast-docs/StructureDefinition-fhircast-content-update-bundle.html
  if (!entry.fullUrl) {
    throw new OperationOutcomeError(badRequest('DELETE entry in update bundle missing fullUrl'));
  }
  const resourceId = resolveId({ reference: entry.fullUrl });
  if (!resourceId) {
    // See: https://build.fhir.org/ig/HL7/fhircast-docs/3-6-3-DiagnosticReport-update.html#:~:text=%7B%0A%20%20%20%20%20%20%20%20%20%20%20%20%20%20%22fullUrl%22%3A%20%22Observation/40afe766%2D3628%2D4ded%2Db5bd%2D925727c013b3%22%2C%0A%20%20%20%20%20%20%20%20%20%20%20%20%20%20%22request%22%3A%20%7B%0A%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20%22method%22%3A%20%22DELETE%22%0A%20%20%20%20%20%20%20%20%20%20%20%20%20%20%7D%0A%20%20%20%20%20%20%20%20%20%20%20%20%7D%2C
    throw new OperationOutcomeError(badRequest('fullUrl in DELETE entry is not a resolvable reference string'));
  }

  // Check if this is for a resource in the anchor context
  // (an example, from the FHIRcast STU3 spec)
  // "If an ImagingStudy was present in the context array that was provided in the [FHIR resource]-open event,
  // Subscribers are not permitted to remove the resource using the Bundle resource inside the updates key."
  // Source: https://build.fhir.org/ig/HL7/fhircast-docs/2-10-ContentSharing.html#:~:text=If%20an%20ImagingStudy%20was%20present%20in%20the%20context%20array%20that%20was%20provided%20in%20the%20%5BFHIR%20resource%5D%2Dopen%20event%2C%20Subscribers%20are%20not%20permitted%20to%20remove%20the%20resource%20using%20the%20Bundle%20resource%20inside%20the%20updates%20key.

  // However, the spec does allow for you to make edits to resources (such as an ImagingStudy, or even the DiagnosticReport itself) that are opened in the context
  // To make it so that driving application could undo an update, it makes sense to support a DELETE on a resource from the open context as long as there is an update
  // Which then removes the "drafted" changes
  // If they try to delete the resource again, or delete it without first drafting changes, it will result in a 400

  // First check if the resource is in the content bundle, we can always delete in that case
  const entryIndex = contentBundle.entry?.findIndex((entry) => entry.resource?.id === resourceId);
  if (entryIndex !== undefined && entryIndex !== -1) {
    // We found a matching entry, we need to remove it
    contentBundle.entry = (contentBundle.entry as BundleEntry[]).filter((entry) => entry.resource?.id !== resourceId);
  } else if (currentContext.context.some((ctx) => ctx.resource.id === resourceId)) {
    throw new OperationOutcomeError(badRequest('Cannot delete a resource that is part of the original open context'));
  } else {
    throw new OperationOutcomeError(badRequest('Cannot delete resource not currently in the content bundle'));
  }
}

async function fetchStoredContext(
  projectId: string,
  topic: string,
  resourceId: string
): Promise<CurrentContext<FhircastAnchorResourceType> | undefined> {
  const topicContextsStorageKey = getTopicContextStorageKey(projectId, topic);
  const storedContextStr = await getCacheRedis().hget(topicContextsStorageKey, resourceId);
  if (!storedContextStr) {
    return undefined;
  }
  return JSON.parse(storedContextStr);
}

async function storeContext(
  projectId: string,
  topic: string,
  anchorResource: Resource,
  currentContext: CurrentContext<FhircastAnchorResourceType>
): Promise<void> {
  const topicContextsStorageKey = getTopicContextStorageKey(projectId, topic);
  await getCacheRedis().hset(topicContextsStorageKey, anchorResource.id as string, JSON.stringify(currentContext));
}

async function finalizeContextChangeRequest(
  res: Response,
  projectId: string,
  payload: FhircastMessagePayload
): Promise<void> {
  await publish(`${projectId}:${payload.event['hub.topic']}`, serializeFhircastChannelMessage(payload));
  // See: https://build.fhir.org/ig/HL7/fhircast-docs/2-6-RequestContextChange.html#response
  // Only HTTP status code is defined for response for RequestContextChange
  res.status(202).json({ success: true, event: payload });
}

async function closeCurrentContext(projectId: string, topic: string): Promise<void> {
  const topicCurrentContextKey = getTopicCurrentContextKey(projectId, topic);
  await getCacheRedis().del(topicCurrentContextKey);
}

// Get the current subscription status
protectedSTU2Routes.get('/:topic', async (req: Request, res: Response) => {
  const { project } = getAuthenticatedContext();
  const topic = singularize(req.params.topic) ?? '';
  const currentContext = await getCurrentContext(project.id, topic);
  // Non-standard FHIRcast extension to support Nuance PowerCast Hub
  if (!currentContext) {
    res.status(200).json([]);
    return;
  }
  res.status(200).json(currentContext.context);
});

protectedSTU3Routes.get('/:topic', async (req: Request, res: Response) => {
  const { project } = getAuthenticatedContext();
  const topic = singularize(req.params.topic) ?? '';
  const currentContext = await getCurrentContext(project.id, topic);
  if (!currentContext) {
    // Source: https://build.fhir.org/ig/HL7/fhircast-docs/2-9-GetCurrentContext.html#:~:text=The%20following%20example%20shows%20the%20returned%20structure%20when%20no%20context%20is%20established%3A
    res.status(200).json({
      'context.type': '',
      context: [],
    });
    return;
  }
  res.status(200).json(currentContext);
});

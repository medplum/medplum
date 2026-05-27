// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { FhircastEventPayload, FhircastMessagePayload } from '@medplum/core';
import { badRequest, getWebSocketUrl, normalizeErrorString, OperationOutcomeError, serverError } from '@medplum/core';
import type { Request, Response } from 'express';
import { Router } from 'express';
import { getConfig } from '../config/loader';
import { getAuthenticatedContext } from '../context';
import { sendOutcome } from '../fhir/outcomes';
import { getLogger } from '../logger';
import { authenticateRequest } from '../oauth/middleware';
import { getOrCreateEndpoint, addSubscriber, removeSubscriber, updateSubscriberEvents } from './subscriptions';
import { getCurrentContext, handleOpenEvent, handleCloseEvent, handleUpdateEvent, handleSelectEvent } from './context-store';
import { publishEvent } from './event-bus';
import { trackEventAcks } from './sync-error';
import type { EventCategory } from './types';
import { getEventCategory, isFhircastMessagePayload, SUPPORTED_EVENTS } from './types';

export const fhircastR4Router = Router();

// ============================================================================
// Public routes (no auth required)
// ============================================================================

const publicRoutes = Router();
fhircastR4Router.use(publicRoutes);

/**
 * .well-known/fhircast-configuration endpoint
 * Returns hub capabilities per FHIRcast spec.
 */
publicRoutes.get('/.well-known/fhircast-configuration', (_req: Request, res: Response) => {
  res.status(200).json({
    eventsSupported: [...SUPPORTED_EVENTS],
    getCurrentSupport: true,
    websocketSupport: true,
    webhookSupport: false,
    fhircastVersion: 'STU3',
  });
});

// ============================================================================
// Protected routes (require authentication)
// ============================================================================

const protectedRoutes = Router().use(authenticateRequest);
fhircastR4Router.use(protectedRoutes);

/**
 * POST / — Subscription request (URL-encoded) or context change (JSON)
 *
 * Per spec:
 * - Subscription: Content-Type: application/x-www-form-urlencoded
 * - Context change: Content-Type: application/fhir+json
 *
 * We also accept JSON for subscriptions (for backwards compatibility / easier testing).
 */
protectedRoutes.post('/', async (req: Request, res: Response) => {
  try {
    // Determine if this is a subscription request or context change request
    if (isSubscriptionRequest(req)) {
      await handleSubscriptionRequest(req, res);
    } else if (isContextChangeRequest(req)) {
      await handleContextChangeRequest(req, res);
    } else {
      sendOutcome(res, badRequest('Request must be a subscription (URL-encoded) or context change (FHIR+JSON)'));
    }
  } catch (err) {
    if (err instanceof OperationOutcomeError) {
      sendOutcome(res, err.outcome);
      return;
    }
    getLogger().error('[FHIRcast R4] Unhandled error in POST /', { error: normalizeErrorString(err) });
    sendOutcome(res, serverError(err instanceof Error ? err : new Error(String(err))));
  }
});

/**
 * POST /:topic — Context change request for a specific topic
 * Content-Type: application/fhir+json
 */
protectedRoutes.post('/:topic', async (req: Request, res: Response) => {
  try {
    await handleContextChangeRequest(req, res);
  } catch (err) {
    if (err instanceof OperationOutcomeError) {
      sendOutcome(res, err.outcome);
      return;
    }
    getLogger().error('[FHIRcast R4] Unhandled error in POST /:topic', { error: normalizeErrorString(err) });
    sendOutcome(res, serverError(err instanceof Error ? err : new Error(String(err))));
  }
});

/**
 * GET /:topic — GetCurrentContext
 * Returns the current context for a topic.
 *
 * Per spec: https://build.fhir.org/ig/HL7/fhircast-docs/2-9-GetCurrentContext.html
 */
protectedRoutes.get('/:topic', async (req: Request, res: Response) => {
  try {
    const { project } = getAuthenticatedContext();
    const topic = req.params.topic;

    const currentContext = await getCurrentContext(project.id, topic);
    if (!currentContext) {
      // Per spec: empty context when no context is established
      res.status(200).json({
        'context.type': '',
        context: [],
      });
      return;
    }

    res.status(200).json(currentContext);
  } catch (err) {
    if (err instanceof OperationOutcomeError) {
      sendOutcome(res, err.outcome);
      return;
    }
    getLogger().error('[FHIRcast R4] Unhandled error in GET /:topic', { error: normalizeErrorString(err) });
    sendOutcome(res, serverError(err instanceof Error ? err : new Error(String(err))));
  }
});

// ============================================================================
// Request type detection
// ============================================================================

function isSubscriptionRequest(req: Request): boolean {
  const contentType = req.headers['content-type'] || '';

  // URL-encoded subscription
  if (contentType.includes('application/x-www-form-urlencoded')) {
    return true;
  }

  // JSON subscription (has hub.mode but no event)
  if (req.body && req.body['hub.mode'] && !req.body.event) {
    return true;
  }

  return false;
}

function isContextChangeRequest(req: Request): boolean {
  // Has FHIRcast event structure
  if (req.body && req.body.id && req.body.event && req.body.timestamp) {
    return true;
  }
  return false;
}

// ============================================================================
// Subscription handling
// ============================================================================

async function handleSubscriptionRequest(req: Request, res: Response): Promise<void> {
  const ctx = getAuthenticatedContext();

  // Parse subscription fields from either URL-encoded or JSON body
  const channelType = req.body['hub.channel.type'];
  const mode = req.body['hub.mode'] as string;
  const topic = req.body['hub.topic'] as string;
  const events = req.body['hub.events'] as string;
  const leaseSeconds = req.body['hub.lease_seconds'] ? parseInt(req.body['hub.lease_seconds'], 10) : undefined;
  const subscriberName = req.body['subscriber.name'] as string | undefined;
  const existingEndpoint = req.body['hub.channel.endpoint'] as string | undefined;

  // Validate required fields
  if (!channelType) {
    sendOutcome(res, badRequest('Missing hub.channel.type'));
    return;
  }
  if (channelType !== 'websocket') {
    sendOutcome(res, badRequest('Invalid hub.channel.type: must be "websocket"'));
    return;
  }
  if (!mode) {
    sendOutcome(res, badRequest('Missing hub.mode'));
    return;
  }
  if (!topic) {
    sendOutcome(res, badRequest('Missing hub.topic'));
    return;
  }

  if (mode === 'subscribe') {
    await handleSubscribe(ctx, req, res, topic, events, leaseSeconds, subscriberName, existingEndpoint);
  } else if (mode === 'unsubscribe') {
    await handleUnsubscribe(ctx, res, topic, existingEndpoint);
  } else {
    sendOutcome(res, badRequest(`Invalid hub.mode: '${mode}', must be 'subscribe' or 'unsubscribe'`));
  }
}

async function handleSubscribe(
  ctx: ReturnType<typeof getAuthenticatedContext>,
  _req: Request,
  res: Response,
  topic: string,
  events: string | undefined,
  leaseSeconds: number | undefined,
  subscriberName: string | undefined,
  existingEndpoint: string | undefined
): Promise<void> {
  // Events are conditional per spec - required for new subscriptions
  if (!events && !existingEndpoint) {
    sendOutcome(res, badRequest('Missing hub.events for new subscription'));
    return;
  }

  const projectId = ctx.project.id;

  // Get or create endpoint
  let endpoint: string;
  try {
    endpoint = await getOrCreateEndpoint(projectId, topic);
  } catch (err) {
    getLogger().error('[FHIRcast R4] Failed to get endpoint', {
      topic,
      error: normalizeErrorString(err),
    });
    sendOutcome(res, serverError(new Error('Failed to get endpoint for topic')));
    return;
  }

  // Register or update subscription
  if (existingEndpoint) {
    // Re-subscription with existing endpoint - update events
    const updated = await updateSubscriberEvents(projectId, topic, endpoint, events || '', leaseSeconds);
    if (!updated) {
      // New subscription on existing endpoint
      await addSubscriber(projectId, topic, endpoint, events || '', subscriberName, leaseSeconds);
    }
  } else {
    await addSubscriber(projectId, topic, endpoint, events || '', subscriberName, leaseSeconds);
  }

  // Return WebSocket endpoint URL
  const config = getConfig();
  res.status(202).json({
    'hub.channel.endpoint': getWebSocketUrl(config.baseUrl, `/ws/fhircast-r4/${endpoint}`),
  });
}

async function handleUnsubscribe(
  ctx: ReturnType<typeof getAuthenticatedContext>,
  res: Response,
  topic: string,
  endpointUrl: string | undefined
): Promise<void> {
  if (!endpointUrl) {
    sendOutcome(res, badRequest('Missing hub.channel.endpoint for unsubscribe'));
    return;
  }

  const projectId = ctx.project.id;

  // Extract endpoint ID from WSS URL
  const endpointParts = endpointUrl.split('/');
  const endpoint = endpointParts[endpointParts.length - 1];

  await removeSubscriber(projectId, topic, endpoint);

  // Return the endpoint in response per spec
  res.status(202).json({
    'hub.channel.endpoint': endpointUrl,
  });
}

// ============================================================================
// Context change handling
// ============================================================================

/**
 * Event dispatch table: maps event categories to handlers.
 * Replaces the fragile string suffix matching in the old hub.
 */
const EVENT_HANDLERS: Record<EventCategory, (projectId: string, event: FhircastEventPayload) => Promise<void>> = {
  open: handleOpenEvent,
  close: handleCloseEvent,
  update: async (projectId, event) => {
    await handleUpdateEvent(projectId, event);
  },
  select: handleSelectEvent,
  other: async () => {
    // Default: no context modification needed (e.g. userlogout, userhibernate)
  },
};

async function handleContextChangeRequest(req: Request, res: Response): Promise<void> {
  const ctx = getAuthenticatedContext();
  const body = req.body;

  // Validate basic structure
  if (!isFhircastMessagePayload(body)) {
    sendOutcome(res, badRequest('Invalid context change request: missing id, timestamp, or event'));
    return;
  }

  const payload = body as FhircastMessagePayload;
  const { event } = payload;

  // Validate event fields
  if (!event['hub.topic']) {
    sendOutcome(res, badRequest('Missing event["hub.topic"]'));
    return;
  }
  if (!event['hub.event']) {
    sendOutcome(res, badRequest('Missing event["hub.event"]'));
    return;
  }
  if (!event.context) {
    sendOutcome(res, badRequest('Missing event.context'));
    return;
  }

  const projectId = ctx.project.id;
  const category = getEventCategory(event['hub.event']);
  const handler = EVENT_HANDLERS[category];

  // Execute the context handler (may modify event payload in-place with versionId)
  await handler(projectId, event);

  // Publish the event to subscribers
  const subscribers = await publishEvent(projectId, payload);

  // Start ack tracking: 10-second timeout per subscriber, SyncError on timeout/refusal
  trackEventAcks(payload.id, event['hub.event'], subscribers);

  // Per spec: return 202 Accepted
  res.status(202).json({ success: true });
}

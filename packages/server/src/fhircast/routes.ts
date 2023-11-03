import { FhircastMessagePayload, badRequest, generateId } from '@medplum/core';
import { Request, Response, Router } from 'express';
import { body, validationResult } from 'express-validator';
import { asyncWrap } from '../async';
import { getConfig } from '../config';
import { invalidRequest, sendOutcome } from '../fhir/outcomes';
import { authenticateRequest } from '../oauth/middleware';
import { getRedis } from '../redis';

export const fhircastRouter = Router();

const publicRoutes = Router();
fhircastRouter.use(publicRoutes);

const protectedRoutes = Router().use(authenticateRequest);
fhircastRouter.use(protectedRoutes);

publicRoutes.get('/.well-known/fhircast-configuration', (_req: Request, res: Response) => {
  res.status(200).json({
    eventsSupported: [
      'syncerror',
      'heartbeat',
      'userlogout',
      'userhibernate',
      'patient-open',
      'patient-close',
      'imagingstudy-open',
      'imagingstudy-close',
      'encounter-open',
      'encounter-close',
      'diagnosticreport-open',
      'diagnosticreport-close',
      'diagnosticreport-select',
      'diagnosticreport-update',
    ],
    getCurrentSupport: true,
    websocketSupport: true,
    webhookSupport: false,
    fhircastVersion: 'STU3',
  });
});

// Register a new subscription
protectedRoutes.post(
  '/',
  [
    body('hub.channel.type').notEmpty().withMessage('Missing hub.channel.type'),
    body('hub.mode').notEmpty().withMessage('Missing hub.mode'),
    body('hub.topic').notEmpty().withMessage('Missing hub.topic'),
    body('hub.events').notEmpty().withMessage('Missing hub.events'),
  ],
  asyncWrap(async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      sendOutcome(res, invalidRequest(errors));
      return;
    }

    const type = req.body['hub.channel.type'];
    if (type !== 'websocket') {
      sendOutcome(res, badRequest('Invalid hub.channel.type'));
      return;
    }

    const mode = req.body['hub.mode'];
    if (mode !== 'subscribe') {
      sendOutcome(res, badRequest('Invalid hub.mode'));
      return;
    }

    const topic = req.body['hub.topic'];
    const subscriptionEndpoint = topic; // TODO: Create separate subscription endpoint for topic
    const config = getConfig();

    res.status(202).json({
      'hub.channel.endpoint': new URL(`/ws/fhircast/${subscriptionEndpoint}`, config.baseUrl)
        .toString()
        .replace('http://', 'ws://')
        .replace('https://', 'wss://'),
    });
  })
);

// Publish an event to the hub topic
protectedRoutes.post(
  '/:topic',
  [
    body('id').notEmpty().withMessage('Missing event ID'),
    body('timestamp').notEmpty().withMessage('Missing event timestamp'),
    body('event').notEmpty().withMessage('Missing event payload'),
  ],
  asyncWrap(async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      sendOutcome(res, invalidRequest(errors));
      return;
    }

    const { event } = req.body as FhircastMessagePayload;
    let stringifiedBody = JSON.stringify(req.body);
    // Check if this an open event
    if (event['hub.event'].endsWith('-open')) {
      // TODO: Support this as a param for event type: "versionable"?
      if (event['hub.event'] === 'diagnosticreport-open') {
        event['context.versionId'] = generateId();
        stringifiedBody = JSON.stringify(req.body);
      }
      // TODO: we need to get topic from event and not route param since per spec, the topic shouldn't be the slug like we have it
      await getRedis().set(`::fhircast::${req.params.topic}::latest::`, stringifiedBody);
    } else if (event['hub.event'].endsWith('-close')) {
      // We always close the current context, even if the event is not for the original resource... There isn't any mention of checking to see it's the right resource, so it seems it may be assumed to be always valid to do any arbitrary close as long as there is an existing context...
      await getRedis().del(`::fhircast::${req.params.topic}::latest::`);
    }
    await getRedis().publish(req.params.topic as string, stringifiedBody);
    res.status(201).json({ success: true, event: body });
  })
);

// Get the current subscription status
protectedRoutes.get(
  '/:topic',
  asyncWrap(async (req: Request, res: Response) => {
    const latestEventStr = await getRedis().get(`::fhircast::${req.params.topic}::latest::`);
    // Non-standard FHIRCast extension to support Nuance PowerCast Hub
    if (!latestEventStr) {
      res.status(200).json([]);
      return;
    }
    res.status(200).json(JSON.parse(latestEventStr).event.context);
  })
);

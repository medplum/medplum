import { badRequest } from '@medplum/core';
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
      'userlogout',
      'userhibernate',
      'patient-open',
      'patient-close',
      'imagingstudy-open',
      'imagingstudy-close',
    ],
    websocketSupport: true,
    webhookSupport: false,
    fhircastVersion: 'STU2',
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

    await getRedis().publish(req.params.topic as string, JSON.stringify(req.body));
    res.status(201).json({ success: true, event: body });
  })
);

// Get the current subscription status
// Non-standard FHIRCast extension to support Nuance PowerCast Hub
protectedRoutes.get('/:topic', (req: Request, res: Response) => {
  res.status(200).json([]);
});

import { allOk, badRequest, created, getStatus } from '@medplum/core';
import { OperationOutcome, Resource } from '@medplum/fhirtypes';
import { NextFunction, Request, Response, Router } from 'express';
import { Operation } from 'fast-json-patch';
import { asyncWrap } from '../async';
import { authenticateToken } from '../oauth/middleware';
import { processBatch } from './batch';
import { bulkDataRouter } from './bulkdata';
import { getCapabilityStatement } from './metadata';
import { csvHandler } from './operations/csv';
import { deployHandler } from './operations/deploy';
import { executeHandler } from './operations/execute';
import { expandOperator } from './operations/expand';
import { graphqlHandler } from './operations/graphql';
import { groupExportHandler } from './operations/groupexport';
import { patientEverythingHandler } from './operations/patienteverything';
import { planDefinitionApplyHandler } from './operations/plandefinitionapply';
import { resourceGraphHandler } from './operations/resourcegraph';
import { sendOutcome } from './outcomes';
import { Repository } from './repo';
import { rewriteAttachments, RewriteMode } from './rewrite';
import { validateResource } from './schema';
import { parseSearchRequest } from './search';
import { smartConfigurationHandler, smartStylingHandler } from './smart';

export const fhirRouter = Router();

// OperationOutcome interceptor
fhirRouter.use((req: Request, res: Response, next: NextFunction) => {
  const oldJson = res.json;

  res.json = (data: any) => {
    // Restore the original json to avoid double response
    // See: https://stackoverflow.com/a/60817116
    res.json = oldJson;

    // FHIR "Prefer" header preferences
    // See: https://www.hl7.org/fhir/http.html#ops
    // Prefer: return=minimal
    // Prefer: return=representation
    // Prefer: return=OperationOutcome
    const prefer = req.get('Prefer');
    if (prefer === 'return=minimal') {
      return res.send();
    }

    // Unless already set, use the FHIR content type
    if (!res.get('Content-Type')) {
      res.contentType('application/fhir+json');
    }

    return res.json(data);
  };
  next();
});

// Public routes do not require authentication
const publicRoutes = Router();
fhirRouter.use(publicRoutes);

// Metadata / CapabilityStatement
publicRoutes.get('/metadata', (_req: Request, res: Response) => {
  res.status(200).json(getCapabilityStatement());
});

// SMART-on-FHIR configuration
publicRoutes.get('/.well-known/smart-configuration', smartConfigurationHandler);
publicRoutes.get('/.well-known/smart-styles.json', smartStylingHandler);

// Protected routes require authentication
const protectedRoutes = Router();
protectedRoutes.use(authenticateToken);
fhirRouter.use(protectedRoutes);

// ValueSet $expand operation
protectedRoutes.get('/ValueSet/([$]|%24)expand', expandOperator);

// CSV Export
protectedRoutes.get('/:resourceType/([$]|%24)csv', asyncWrap(csvHandler));

// Bot $execute operation
protectedRoutes.post('/Bot/:id/([$]|%24)execute', executeHandler);

// Bot $deploy operation
protectedRoutes.post('/Bot/:id/([$]|%24)deploy', deployHandler);

// Group $export operation
protectedRoutes.get('/Group/:id/([$]|%24)export', asyncWrap(groupExportHandler));

// Bulk Data
protectedRoutes.use('/bulkdata', bulkDataRouter);

// GraphQL
protectedRoutes.post('/([$]|%24)graphql', graphqlHandler);

// PlanDefinition $apply operation
protectedRoutes.post('/PlanDefinition/:id/([$]|%24)apply', asyncWrap(planDefinitionApplyHandler));

// Resource $graph operation
protectedRoutes.get('/:resourceType/:id/([$]|%24)graph', asyncWrap(resourceGraphHandler));

// Patient $everything operation
protectedRoutes.get('/Patient/:id/([$]|%24)everything', asyncWrap(patientEverythingHandler));

// Execute batch
protectedRoutes.post(
  '/',
  asyncWrap(async (req: Request, res: Response) => {
    if (!isFhirJsonContentType(req)) {
      res.status(400).send('Unsupported content type');
      return;
    }
    const bundle = req.body;
    if (bundle.resourceType !== 'Bundle') {
      sendOutcome(res, badRequest('Not a bundle'));
      return;
    }
    const repo = res.locals.repo as Repository;
    const result = await processBatch(repo, bundle);
    await sendResponse(res, allOk, result);
  })
);

// Search
protectedRoutes.get(
  '/:resourceType',
  asyncWrap(async (req: Request, res: Response) => {
    const { resourceType } = req.params;
    const repo = res.locals.repo as Repository;
    const query = req.query as Record<string, string[] | string | undefined>;
    const bundle = await repo.search(parseSearchRequest(resourceType, query));
    await sendResponse(res, allOk, bundle);
  })
);

// Search by POST
protectedRoutes.post(
  '/:resourceType/_search',
  asyncWrap(async (req: Request, res: Response) => {
    if (!req.is('application/x-www-form-urlencoded')) {
      res.status(400).send('Unsupported content type');
      return;
    }
    const { resourceType } = req.params;
    const repo = res.locals.repo as Repository;
    const query = req.body as Record<string, string[] | string | undefined>;
    const bundle = await repo.search(parseSearchRequest(resourceType, query));
    await sendResponse(res, allOk, bundle);
  })
);

// Create resource
protectedRoutes.post(
  '/:resourceType',
  asyncWrap(async (req: Request, res: Response) => {
    if (!isFhirJsonContentType(req)) {
      res.status(400).send('Unsupported content type');
      return;
    }
    const { resourceType } = req.params;
    const resource = req.body;
    if (resource.resourceType !== resourceType) {
      sendOutcome(res, badRequest('Incorrect resource type'));
      return;
    }
    const repo = res.locals.repo as Repository;
    const result = await repo.createResource(resource);
    await sendResponse(res, created, result);
  })
);

// Read resource by ID
protectedRoutes.get(
  '/:resourceType/:id',
  asyncWrap(async (req: Request, res: Response) => {
    const { resourceType, id } = req.params;
    const repo = res.locals.repo as Repository;
    const resource = await repo.readResource(resourceType, id);
    await sendResponse(res, allOk, resource);
  })
);

// Read resource history
protectedRoutes.get(
  '/:resourceType/:id/_history',
  asyncWrap(async (req: Request, res: Response) => {
    const { resourceType, id } = req.params;
    const repo = res.locals.repo as Repository;
    const bundle = await repo.readHistory(resourceType, id);
    await sendResponse(res, allOk, bundle);
  })
);

// Read resource version by version ID
protectedRoutes.get(
  '/:resourceType/:id/_history/:vid',
  asyncWrap(async (req: Request, res: Response) => {
    const { resourceType, id, vid } = req.params;
    const repo = res.locals.repo as Repository;
    const resource = await repo.readVersion(resourceType, id, vid);
    await sendResponse(res, allOk, resource);
  })
);

// Update resource
protectedRoutes.put(
  '/:resourceType/:id',
  asyncWrap(async (req: Request, res: Response) => {
    if (!isFhirJsonContentType(req)) {
      res.status(400).send('Unsupported content type');
      return;
    }
    const { resourceType, id } = req.params;
    const resource = req.body;
    if (resource.resourceType !== resourceType) {
      sendOutcome(res, badRequest('Incorrect resource type'));
      return;
    }
    if (resource.id !== id) {
      sendOutcome(res, badRequest('Incorrect ID'));
      return;
    }
    const repo = res.locals.repo as Repository;
    const result = await repo.updateResource(resource);
    await sendResponse(res, allOk, result);
  })
);

// Delete resource
protectedRoutes.delete(
  '/:resourceType/:id',
  asyncWrap(async (req: Request, res: Response) => {
    const { resourceType, id } = req.params;
    const repo = res.locals.repo as Repository;
    await repo.deleteResource(resourceType, id);
    sendOutcome(res, allOk);
  })
);

// Patch resource
protectedRoutes.patch(
  '/:resourceType/:id',
  asyncWrap(async (req: Request, res: Response) => {
    if (!req.is('application/json-patch+json')) {
      res.status(400).send('Unsupported content type');
      return;
    }
    const { resourceType, id } = req.params;
    const patch = req.body as Operation[];
    const repo = res.locals.repo as Repository;
    const resource = await repo.patchResource(resourceType, id, patch);
    await sendResponse(res, allOk, resource);
  })
);

// Validate create resource
protectedRoutes.post(
  '/:resourceType/([$])validate',
  asyncWrap(async (req: Request, res: Response) => {
    if (!isFhirJsonContentType(req)) {
      res.status(400).send('Unsupported content type');
      return;
    }
    validateResource(req.body);
    sendOutcome(res, allOk);
  })
);

// Reindex resource
protectedRoutes.post(
  '/:resourceType/:id/([$])reindex',
  asyncWrap(async (req: Request, res: Response) => {
    const { resourceType, id } = req.params;
    const repo = res.locals.repo as Repository;
    const resource = await repo.reindexResource(resourceType, id);
    await sendResponse(res, allOk, resource);
  })
);

// Resend subscriptions
protectedRoutes.post(
  '/:resourceType/:id/([$])resend',
  asyncWrap(async (req: Request, res: Response) => {
    const { resourceType, id } = req.params;
    const repo = res.locals.repo as Repository;
    const resource = await repo.resendSubscriptions(resourceType, id);
    await sendResponse(res, allOk, resource);
  })
);

export function isFhirJsonContentType(req: Request): boolean {
  return !!(req.is('application/json') || req.is('application/fhir+json'));
}

export async function sendResponse(res: Response, outcome: OperationOutcome, body: Resource): Promise<void> {
  const repo = res.locals.repo as Repository;
  if (body.meta?.versionId) {
    res.set('ETag', `"${body.meta.versionId}"`);
  }
  if (body.meta?.lastUpdated) {
    res.set('Last-Modified', new Date(body.meta.lastUpdated).toUTCString());
  }
  res.status(getStatus(outcome)).json(await rewriteAttachments(RewriteMode.PRESIGNED_URL, repo, body));
}

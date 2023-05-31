import { allOk, getStatus, isOk, OperationOutcomeError, validateResource } from '@medplum/core';
import { FhirRequest, FhirRouter, HttpMethod } from '@medplum/fhir-router';
import { OperationOutcome, Resource } from '@medplum/fhirtypes';
import { NextFunction, Request, Response, Router } from 'express';
import { asyncWrap } from '../async';
import { authenticateToken } from '../oauth/middleware';
import { bulkDataRouter } from './bulkdata';
import { jobRouter } from './job';
import { getCapabilityStatement } from './metadata';
import { csvHandler } from './operations/csv';
import { deployHandler } from './operations/deploy';
import { evaluateMeasureHandler } from './operations/evaluatemeasure';
import { executeHandler } from './operations/execute';
import { expandOperator } from './operations/expand';
import { bulkExportHandler } from './operations/export';
import { expungeHandler } from './operations/expunge';
import { groupExportHandler } from './operations/groupexport';
import { patientEverythingHandler } from './operations/patienteverything';
import { planDefinitionApplyHandler } from './operations/plandefinitionapply';
import { projectCloneHandler } from './operations/projectclone';
import { resourceGraphHandler } from './operations/resourcegraph';
import { sendOutcome } from './outcomes';
import { Repository } from './repo';
import { rewriteAttachments, RewriteMode } from './rewrite';
import { smartConfigurationHandler, smartStylingHandler } from './smart';
import { getConfig } from '../config';

export const fhirRouter = Router();

// If the config file is not present, assume introspection is disabled
let config;
try {
  config = getConfig();
} catch (error) {
  config = { introspectionEnabled: false };
}
const router = new FhirRouter({ introspectionEnabled: config.introspectionEnabled });

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

// Project $export
protectedRoutes.post('/([$]|%24)export', bulkExportHandler);

// Project $clone
protectedRoutes.post('/Project/:id/([$]|%24)clone', asyncWrap(projectCloneHandler));

// ValueSet $expand operation
protectedRoutes.get('/ValueSet/([$]|%24)expand', expandOperator);

// CSV Export
protectedRoutes.get('/:resourceType/([$]|%24)csv', asyncWrap(csvHandler));

// Bot $execute operation
protectedRoutes.post('/Bot/([$]|%24)execute', executeHandler);
protectedRoutes.post('/Bot/:id/([$]|%24)execute', executeHandler);

// Bot $deploy operation
protectedRoutes.post('/Bot/:id/([$]|%24)deploy', deployHandler);

// Group $export operation
protectedRoutes.get('/Group/:id/([$]|%24)export', asyncWrap(groupExportHandler));

// Bulk Data
protectedRoutes.use('/bulkdata', bulkDataRouter);

// Async Job
protectedRoutes.use('/job', jobRouter);

// Measure $evaluate-measure operation
protectedRoutes.post('/Measure/:id/([$]|%24)evaluate-measure', asyncWrap(evaluateMeasureHandler));

// PlanDefinition $apply operation
protectedRoutes.post('/PlanDefinition/:id/([$]|%24)apply', asyncWrap(planDefinitionApplyHandler));

// Resource $graph operation
protectedRoutes.get('/:resourceType/:id/([$]|%24)graph', asyncWrap(resourceGraphHandler));

// Patient $everything operation
protectedRoutes.get('/Patient/:id/([$]|%24)everything', asyncWrap(patientEverythingHandler));

// $expunge operation
protectedRoutes.post('/:resourceType/:id/([$]|%24)expunge', asyncWrap(expungeHandler));

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
    await repo.reindexResource(resourceType, id);
    sendOutcome(res, allOk);
  })
);

// Resend subscriptions
protectedRoutes.post(
  '/:resourceType/:id/([$])resend',
  asyncWrap(async (req: Request, res: Response) => {
    const { resourceType, id } = req.params;
    const repo = res.locals.repo as Repository;
    await repo.resendSubscriptions(resourceType, id);
    sendOutcome(res, allOk);
  })
);

// Default route
protectedRoutes.use(
  '*',
  asyncWrap(async (req: Request, res: Response) => {
    const repo = res.locals.repo as Repository;
    const request: FhirRequest = {
      method: req.method as HttpMethod,
      pathname: req.originalUrl.replace('/fhir/R4', '').split('?').shift() as string,
      params: req.params,
      query: req.query as Record<string, string>,
      body: req.body,
    };

    const result = await router.handleRequest(request, repo);
    if (result.length === 1) {
      if (!isOk(result[0])) {
        throw new OperationOutcomeError(result[0]);
      }
      sendOutcome(res, result[0]);
    } else {
      await sendResponse(res, result[0], result[1]);
    }
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

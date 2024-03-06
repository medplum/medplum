import { allOk, ContentType, isOk, OperationOutcomeError } from '@medplum/core';
import { FhirRequest, FhirRouter, HttpMethod } from '@medplum/fhir-router';
import { NextFunction, Request, Response, Router } from 'express';
import { asyncWrap } from '../async';
import { getConfig } from '../config';
import { getAuthenticatedContext } from '../context';
import { authenticateRequest } from '../oauth/middleware';
import { recordHistogramValue } from '../otel/otel';
import { bulkDataRouter } from './bulkdata';
import { jobRouter } from './job';
import { getCapabilityStatement } from './metadata';
import { agentPushHandler } from './operations/agentpush';
import { codeSystemImportHandler } from './operations/codesystemimport';
import { codeSystemLookupHandler } from './operations/codesystemlookup';
import { codeSystemValidateCodeHandler } from './operations/codesystemvalidatecode';
import { conceptMapTranslateHandler } from './operations/conceptmaptranslate';
import { csvHandler } from './operations/csv';
import { deployHandler } from './operations/deploy';
import { evaluateMeasureHandler } from './operations/evaluatemeasure';
import { executeHandler } from './operations/execute';
import { expandOperator } from './operations/expand';
import { bulkExportHandler, patientExportHandler } from './operations/export';
import { expungeHandler } from './operations/expunge';
import { getWsBindingTokenHandler } from './operations/getwsbindingtoken';
import { groupExportHandler } from './operations/groupexport';
import { patientEverythingHandler } from './operations/patienteverything';
import { planDefinitionApplyHandler } from './operations/plandefinitionapply';
import { projectCloneHandler } from './operations/projectclone';
import { projectInitHandler } from './operations/projectinit';
import { resourceGraphHandler } from './operations/resourcegraph';
import { structureDefinitionExpandProfileHandler } from './operations/structuredefinitionexpandprofile';
import { codeSystemSubsumesOperation } from './operations/subsumes';
import { valueSetValidateOperation } from './operations/valuesetvalidatecode';
import { sendOutcome } from './outcomes';
import { isFhirJsonContentType, sendResponse } from './response';
import { smartConfigurationHandler, smartStylingHandler } from './smart';
import { agentStatusHandler } from './operations/agentstatus';

export const fhirRouter = Router();

let internalFhirRouter: FhirRouter;

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
      res.contentType(ContentType.FHIR_JSON);
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

// FHIR Versions
publicRoutes.get('/([$]|%24)versions', (_req: Request, res: Response) => {
  res.status(200).json({ versions: ['4.0'], default: '4.0' });
});

// SMART-on-FHIR configuration
publicRoutes.get('/.well-known/smart-configuration', smartConfigurationHandler);
publicRoutes.get('/.well-known/smart-styles.json', smartStylingHandler);

// Protected routes require authentication
const protectedRoutes = Router().use(authenticateRequest);
fhirRouter.use(protectedRoutes);

// Project $export
protectedRoutes.get('/([$]|%24)export', bulkExportHandler);
protectedRoutes.post('/([$]|%24)export', bulkExportHandler);

// Project $clone
protectedRoutes.post('/Project/:id/([$]|%24)clone', asyncWrap(projectCloneHandler));

// Project $init
protectedRoutes.post('/Project/([$]|%24)init', asyncWrap(projectInitHandler));

// ConceptMap $translate
protectedRoutes.post('/ConceptMap/([$]|%24)translate', asyncWrap(conceptMapTranslateHandler));
protectedRoutes.post('/ConceptMap/:id/([$]|%24)translate', asyncWrap(conceptMapTranslateHandler));

// ValueSet $expand operation
protectedRoutes.get('/ValueSet/([$]|%24)expand', expandOperator);

// CodeSystem $import operation
protectedRoutes.post('/CodeSystem/([$]|%24)import', asyncWrap(codeSystemImportHandler));

// CodeSystem $lookup operation
protectedRoutes.post('/CodeSystem/([$]|%24)lookup', asyncWrap(codeSystemLookupHandler));

// CodeSystem $validate-code operation
protectedRoutes.post('/CodeSystem/([$]|%24)validate-code', asyncWrap(codeSystemValidateCodeHandler));

// CodeSystem $subsumes operation
protectedRoutes.post('/CodeSystem/([$]|%24)subsumes', codeSystemSubsumesOperation);

// CodeSystem $validate-code operation
protectedRoutes.post('/ValueSet/([$]|%24)validate-code', valueSetValidateOperation);

// CSV Export
protectedRoutes.get('/:resourceType/([$]|%24)csv', asyncWrap(csvHandler));

// Agent $status operation
protectedRoutes.get('/Agent/([$]|%24)status', agentStatusHandler);
protectedRoutes.get('/Agent/:id/([$]|%24)status', agentStatusHandler);

// Agent $push operation
protectedRoutes.post('/Agent/([$]|%24)push', agentPushHandler);
protectedRoutes.post('/Agent/:id/([$]|%24)push', agentPushHandler);

// Bot $execute operation
// Allow extra path content after the "$execute" to support external callers who append path info
const botPaths = [
  '/Bot/([$]|%24)execute',
  '/Bot/:id/([$]|%24)execute',
  '/Bot/([$]|%24)execute/*',
  '/Bot/:id/([$]|%24)execute/*',
];
protectedRoutes.get(botPaths, executeHandler);
protectedRoutes.post(botPaths, executeHandler);

// Bot $deploy operation
protectedRoutes.post('/Bot/:id/([$]|%24)deploy', deployHandler);

// Group $export operation
protectedRoutes.get('/Group/:id/([$]|%24)export', asyncWrap(groupExportHandler));

// Patient $export operation
protectedRoutes.get('/Patient/([$]|%24)export', asyncWrap(patientExportHandler));

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

// $get-ws-binding-token operation
protectedRoutes.get('/Subscription/:id/([$]|%24)get-ws-binding-token', asyncWrap(getWsBindingTokenHandler));

// StructureDefinition $expand-profile operation
protectedRoutes.post(
  '/StructureDefinition/([$]|%24)expand-profile',
  asyncWrap(structureDefinitionExpandProfileHandler)
);

// Validate create resource
protectedRoutes.post(
  '/:resourceType/([$])validate',
  asyncWrap(async (req: Request, res: Response) => {
    if (!isFhirJsonContentType(req)) {
      res.status(400).send('Unsupported content type');
      return;
    }
    const ctx = getAuthenticatedContext();
    await ctx.repo.validateResource(req.body);
    sendOutcome(res, allOk);
  })
);

// Reindex resource
protectedRoutes.post(
  '/:resourceType/:id/([$])reindex',
  asyncWrap(async (req: Request, res: Response) => {
    const ctx = getAuthenticatedContext();
    const { resourceType, id } = req.params;
    await ctx.repo.reindexResource(resourceType, id);
    sendOutcome(res, allOk);
  })
);

// Resend subscriptions
protectedRoutes.post(
  '/:resourceType/:id/([$])resend',
  asyncWrap(async (req: Request, res: Response) => {
    const ctx = getAuthenticatedContext();
    const { resourceType, id } = req.params;
    await ctx.repo.resendSubscriptions(resourceType, id);
    sendOutcome(res, allOk);
  })
);

// Default route
protectedRoutes.use(
  '*',
  asyncWrap(async (req: Request, res: Response) => {
    const ctx = getAuthenticatedContext();
    if (!internalFhirRouter) {
      internalFhirRouter = new FhirRouter({ introspectionEnabled: getConfig().introspectionEnabled });
      internalFhirRouter.addEventListener('warn', (e: any) =>
        ctx.logger.warn(e.message, { ...e.data, project: ctx.project.id })
      );
      internalFhirRouter.addEventListener('batch', ({ count, errors, size, bundleType }: any) => {
        recordHistogramValue('medplum.batch.entries', count, { bundleType });
        recordHistogramValue('medplum.batch.errors', errors, { bundleType });
        recordHistogramValue('medplum.batch.size', size, { bundleType });

        if (errors > 0 && bundleType === 'transaction') {
          ctx.logger.warn('Error processing transaction Bundle', { count, errors, size, project: ctx.project.id });
        }
      });
    }
    const request: FhirRequest = {
      method: req.method as HttpMethod,
      pathname: req.originalUrl.replace('/fhir/R4', '').split('?').shift() as string,
      params: req.params,
      query: req.query as Record<string, string>,
      body: req.body,
      headers: req.headers,
    };

    const result = await internalFhirRouter.handleRequest(request, ctx.repo);
    if (result.length === 1) {
      if (!isOk(result[0])) {
        throw new OperationOutcomeError(result[0]);
      }
      sendOutcome(res, result[0]);
    } else {
      await sendResponse(req, res, result[0], result[1]);
    }
  })
);

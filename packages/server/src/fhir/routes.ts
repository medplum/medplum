import { allOk, ContentType, isOk, OperationOutcomeError } from '@medplum/core';
import { FhirRequest, FhirRouter, HttpMethod, RepositoryMode } from '@medplum/fhir-router';
import { ResourceType } from '@medplum/fhirtypes';
import { NextFunction, Request, Response, Router } from 'express';
import { asyncWrap } from '../async';
import { awsTextractHandler } from '../cloud/aws/textract';
import { getConfig } from '../config';
import { getAuthenticatedContext } from '../context';
import { authenticateRequest } from '../oauth/middleware';
import { recordHistogramValue } from '../otel/otel';
import { bulkDataRouter } from './bulkdata';
import { jobRouter } from './job';
import { getCapabilityStatement } from './metadata';
import { agentBulkStatusHandler } from './operations/agentbulkstatus';
import { agentPushHandler } from './operations/agentpush';
import { agentReloadConfigHandler } from './operations/agentreloadconfig';
import { agentStatusHandler } from './operations/agentstatus';
import { agentUpgradeHandler } from './operations/agentupgrade';
import { codeSystemImportHandler } from './operations/codesystemimport';
import { codeSystemLookupHandler } from './operations/codesystemlookup';
import { codeSystemValidateCodeHandler } from './operations/codesystemvalidatecode';
import { conceptMapTranslateHandler } from './operations/conceptmaptranslate';
import { csvHandler } from './operations/csv';
import { dbStatsHandler } from './operations/dbstats';
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
import { ResendSubscriptionsOptions } from './repo';
import { sendResponse } from './response';
import { smartConfigurationHandler, smartStylingHandler } from './smart';

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

// CSV Export (cannot use FhirRouter due to CSV output)
protectedRoutes.get('/:resourceType/([$]|%24)csv', asyncWrap(csvHandler));

// Agent $push operation (cannot use FhirRouter due to HL7 and DICOM output)
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

// Bulk Data
protectedRoutes.use('/bulkdata', bulkDataRouter);

// Async Job
protectedRoutes.use('/job', jobRouter);

/**
 * Returns the internal FHIR router.
 * This function will be executed on every request.
 * @returns The lazy initialized internal FHIR router.
 */
function getInternalFhirRouter(): FhirRouter {
  if (!internalFhirRouter) {
    internalFhirRouter = initInternalFhirRouter();
  }
  return internalFhirRouter;
}

/**
 * Returns a new FHIR router.
 * This function should only be called once on the first request.
 * @returns A new FHIR router with all the internal operations.
 */
function initInternalFhirRouter(): FhirRouter {
  const router = new FhirRouter({
    introspectionEnabled: getConfig().introspectionEnabled,
  });

  // Project $export
  router.add('GET', '/$export', bulkExportHandler);
  router.add('POST', '/$export', bulkExportHandler);

  // Project $clone
  router.add('POST', '/Project/:id/$clone', projectCloneHandler);

  // Project $init
  router.add('POST', '/Project/$init', projectInitHandler);

  // ConceptMap $translate
  router.add('POST', '/ConceptMap/$translate', conceptMapTranslateHandler);
  router.add('POST', '/ConceptMap/:id/$translate', conceptMapTranslateHandler);

  // ValueSet $expand operation
  router.add('GET', '/ValueSet/$expand', expandOperator);
  router.add('POST', '/ValueSet/$expand', expandOperator);

  // CodeSystem $import operation
  router.add('POST', '/CodeSystem/$import', codeSystemImportHandler);
  router.add('POST', '/CodeSystem/:id/$import', codeSystemImportHandler);

  // CodeSystem $lookup operation
  router.add('GET', '/CodeSystem/$lookup', codeSystemLookupHandler);
  router.add('POST', '/CodeSystem/$lookup', codeSystemLookupHandler);
  router.add('GET', '/CodeSystem/:id/$lookup', codeSystemLookupHandler);
  router.add('POST', '/CodeSystem/:id/$lookup', codeSystemLookupHandler);

  // CodeSystem $validate-code operation
  router.add('GET', '/CodeSystem/$validate-code', codeSystemValidateCodeHandler);
  router.add('POST', '/CodeSystem/$validate-code', codeSystemValidateCodeHandler);
  router.add('GET', '/CodeSystem/:id/$validate-code', codeSystemValidateCodeHandler);
  router.add('POST', '/CodeSystem/:id/$validate-code', codeSystemValidateCodeHandler);

  // CodeSystem $subsumes operation
  router.add('GET', '/CodeSystem/$subsumes', codeSystemSubsumesOperation);
  router.add('POST', '/CodeSystem/$subsumes', codeSystemSubsumesOperation);
  router.add('GET', '/CodeSystem/:id/$subsumes', codeSystemSubsumesOperation);
  router.add('POST', '/CodeSystem/:id/$subsumes', codeSystemSubsumesOperation);

  // ValueSet $validate-code operation
  router.add('GET', '/ValueSet/$validate-code', valueSetValidateOperation);
  router.add('POST', '/ValueSet/$validate-code', valueSetValidateOperation);
  router.add('GET', '/ValueSet/:id/$validate-code', valueSetValidateOperation);
  router.add('POST', '/ValueSet/:id/$validate-code', valueSetValidateOperation);

  // Agent $status operation
  router.add('GET', '/Agent/$status', agentStatusHandler);
  router.add('GET', '/Agent/:id/$status', agentStatusHandler);

  // Agent $bulk-status operation
  router.add('GET', '/Agent/$bulk-status', agentBulkStatusHandler);

  // Agent $reload-config operation
  router.add('GET', '/Agent/$reload-config', agentReloadConfigHandler);
  router.add('GET', '/Agent/:id/$reload-config', agentReloadConfigHandler);

  // Agent $upgrade operation
  router.add('GET', '/Agent/$upgrade', agentUpgradeHandler);
  router.add('GET', '/Agent/:id/$upgrade', agentUpgradeHandler);

  // Bot $deploy operation
  router.add('POST', '/Bot/:id/$deploy', deployHandler);

  // Group $export operation
  router.add('GET', '/Group/:id/$export', groupExportHandler);

  // Patient $export operation
  router.add('GET', '/Patient/$export', patientExportHandler);

  // Measure $evaluate-measure operation
  router.add('POST', '/Measure/:id/$evaluate-measure', evaluateMeasureHandler);

  // PlanDefinition $apply operation
  router.add('POST', '/PlanDefinition/:id/$apply', planDefinitionApplyHandler);

  // Resource $graph operation
  router.add('GET', '/:resourceType/:id/$graph', resourceGraphHandler);

  // Patient $everything operation
  router.add('GET', '/Patient/:id/$everything', patientEverythingHandler);

  // $expunge operation
  router.add('POST', '/:resourceType/:id/$expunge', expungeHandler);

  // $get-ws-binding-token operation
  router.add('GET', '/Subscription/:id/$get-ws-binding-token', getWsBindingTokenHandler);

  // StructureDefinition $expand-profile operation
  router.add('POST', '/StructureDefinition/$expand-profile', structureDefinitionExpandProfileHandler);

  // AWS operations
  router.add('POST', '/:resourceType/:id/$aws-textract', awsTextractHandler);

  // Validate create resource
  router.add('POST', '/:resourceType/$validate', async (req: FhirRequest) => {
    const ctx = getAuthenticatedContext();
    await ctx.repo.validateResource(req.body);
    return [allOk];
  });

  // Reindex resource
  router.add('POST', '/:resourceType/:id/$reindex', async (req: FhirRequest) => {
    const ctx = getAuthenticatedContext();
    const { resourceType, id } = req.params as { resourceType: ResourceType; id: string };
    await ctx.repo.reindexResource(resourceType, id);
    return [allOk];
  });

  // Resend subscriptions
  router.add('POST', '/:resourceType/:id/$resend', async (req: FhirRequest) => {
    const ctx = getAuthenticatedContext();
    const { resourceType, id } = req.params as { resourceType: ResourceType; id: string };
    const options = req.body as ResendSubscriptionsOptions | undefined;
    await ctx.repo.resendSubscriptions(resourceType, id, options);
    return [allOk];
  });

  // Super admin operations
  router.add('POST', '/$db-stats', dbStatsHandler);

  router.addEventListener('warn', (e: any) => {
    const ctx = getAuthenticatedContext();
    ctx.logger.warn(e.message, { ...e.data, project: ctx.project.id });
  });

  router.addEventListener('batch', ({ count, errors, size, bundleType }: any) => {
    const ctx = getAuthenticatedContext();
    const projectId = ctx.project.id;

    const batchMetricOptions = { attributes: { bundleType, projectId } };
    recordHistogramValue('medplum.batch.entries', count, batchMetricOptions);
    recordHistogramValue('medplum.batch.errors', errors, batchMetricOptions);
    recordHistogramValue('medplum.batch.size', size, batchMetricOptions);

    if (errors > 0 && bundleType === 'transaction') {
      ctx.logger.warn('Error processing transaction Bundle', { count, errors, size, project: projectId });
    }
  });

  return router;
}

// Default route
protectedRoutes.use(
  '*',
  asyncWrap(async (req: Request, res: Response) => {
    const ctx = getAuthenticatedContext();

    const request: FhirRequest = {
      method: req.method as HttpMethod,
      pathname: req.originalUrl.replace('/fhir/R4', '').split('?').shift() as string,
      params: req.params,
      query: req.query as Record<string, string>,
      body: req.body,
      headers: req.headers,
      config: {
        graphqlMaxDepth: ctx.project.systemSetting?.find((s) => s.name === 'graphqlMaxDepth')?.valueInteger,
        graphqlMaxPageSize: ctx.project.systemSetting?.find((s) => s.name === 'graphqlMaxPageSize')?.valueInteger,
        graphqlMaxSearches: ctx.project.systemSetting?.find((s) => s.name === 'graphqlMaxSearches')?.valueInteger,
      },
    };

    if (request.pathname.includes('$graphql')) {
      // If this is a GraphQL request, mark the repository as eligible for "reader" mode.
      // Inside the GraphQL handler, the repository will be set to "writer" mode if needed.
      // At the time of this writing, the GraphQL handler is the only place where we consider "reader" mode.
      ctx.repo.setMode(RepositoryMode.READER);
    }

    const result = await getInternalFhirRouter().handleRequest(request, ctx.repo);
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

// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { allOk, ContentType, isNotFound, isOk, OperationOutcomeError, stringify } from '@medplum/core';
import type { BatchEvent, FhirRequest, HttpMethod } from '@medplum/fhir-router';
import { FhirRouter } from '@medplum/fhir-router';
import type { ResourceType } from '@medplum/fhirtypes';
import type { NextFunction, Request, Response } from 'express';
import { Router } from 'express';
import { awsTextractHandler } from '../cloud/aws/textract';
import { getConfig } from '../config/loader';
import { getAuthenticatedContext, tryGetRequestContext } from '../context';
import { authenticateRequest } from '../oauth/middleware';
import { recordHistogramValue } from '../otel/otel';
import { bulkDataRouter } from './bulkdata';
import { jobRouter } from './job';
import { getCapabilityStatement } from './metadata';
import { agentBulkStatusHandler } from './operations/agentbulkstatus';
import { agentFetchLogsHandler } from './operations/agentfetchlogs';
import { agentPushHandler } from './operations/agentpush';
import { agentReloadConfigHandler } from './operations/agentreloadconfig';
import { agentStatusHandler } from './operations/agentstatus';
import { agentUpgradeHandler } from './operations/agentupgrade';
import { aiOperationHandler } from './operations/ai';
import { asyncJobCancelHandler } from './operations/asyncjobcancel';
import { ccdaExportHandler } from './operations/ccdaexport';
import { chargeItemDefinitionApplyHandler } from './operations/chargeitemdefinitionapply';
import { claimExportGetHandler, claimExportPostHandler } from './operations/claimexport';
import { codeSystemImportHandler } from './operations/codesystemimport';
import { codeSystemLookupHandler } from './operations/codesystemlookup';
import { codeSystemValidateCodeHandler } from './operations/codesystemvalidatecode';
import { conceptMapImportHandler } from './operations/conceptmapimport';
import { conceptMapTranslateHandler } from './operations/conceptmaptranslate';
import { csvHandler } from './operations/csv';
import { tryCustomOperation } from './operations/custom';
import { dbConfigureIndexesHandler } from './operations/db-configure-indexes';
import { dbIndexesHandler } from './operations/dbindexes';
import { dbInvalidIndexesHandler } from './operations/dbinvalidindexes';
import { dbSchemaDiffHandler } from './operations/dbschemadiff';
import { dbStatsHandler } from './operations/dbstats';
import { deployHandler } from './operations/deploy';
import { evaluateMeasureHandler } from './operations/evaluatemeasure';
import { executeHandler } from './operations/execute';
import { expandOperator } from './operations/expand';
import { dbExplainHandler } from './operations/explain';
import { bulkExportHandler, patientExportHandler } from './operations/export';
import { expungeHandler } from './operations/expunge';
import { extractHandler } from './operations/extract';
import { scheduleFindHandler } from './operations/find';
import { getWsBindingTokenHandler } from './operations/getwsbindingtoken';
import { groupExportHandler } from './operations/groupexport';
import { appLaunchHandler } from './operations/launch';
import { patientEverythingHandler } from './operations/patienteverything';
import { patientSummaryHandler } from './operations/patientsummary';
import { planDefinitionApplyHandler } from './operations/plandefinitionapply';
import { projectCloneHandler } from './operations/projectclone';
import { projectInitHandler } from './operations/projectinit';
import { resourceGraphHandler } from './operations/resourcegraph';
import { rotateSecretHandler } from './operations/rotatesecret';
import { setAccountsHandler } from './operations/set-accounts';
import { structureDefinitionExpandProfileHandler } from './operations/structuredefinitionexpandprofile';
import { codeSystemSubsumesOperation } from './operations/subsumes';
import { updateUserEmailOperation } from './operations/update-user-email';
import { valueSetValidateOperation } from './operations/valuesetvalidatecode';
import { sendOutcome } from './outcomes';
import type { ResendSubscriptionsOptions } from './repo';
import { sendFhirResponse } from './response';
import { smartConfigurationHandler, smartStylingHandler } from './smart';

export const fhirRouter = Router();

let internalFhirRouter: FhirRouter;

// OperationOutcome interceptor
fhirRouter.use(function setupResponseInterceptors(req: Request, res: Response, next: NextFunction) {
  const oldJson = res.json;
  const oldSend = res.send;

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

    if (!res.get('Content-Type')) {
      res.contentType(ContentType.JSON);
    }

    const pretty = req.query._pretty === 'true';

    if (res.get('Content-Type')?.startsWith(ContentType.FHIR_JSON)) {
      let legacyFhirJsonResponseFormat: boolean | undefined;
      try {
        const ctx = getAuthenticatedContext();
        legacyFhirJsonResponseFormat = ctx.project.systemSetting?.find(
          (s) => s.name === 'legacyFhirJsonResponseFormat'
        )?.valueBoolean;
      } catch (_err) {
        // Ignore errors since unauthenticated requests also use this middleware
      }

      if (!legacyFhirJsonResponseFormat) {
        return res.send(stringify(data, pretty));
      }
    }

    // Default JSON response
    return res.send(JSON.stringify(data, undefined, pretty ? 2 : undefined));
  };
  res.send = (...args: any[]) => {
    // Restore the original method to avoid double response
    // See: https://stackoverflow.com/a/60817116
    res.send = oldSend;

    const ctx = tryGetRequestContext();
    if (ctx?.fhirRateLimiter) {
      // Attach rate limit header before sending first part of response body
      ctx.fhirRateLimiter.attachRateLimitHeader(res);
    }

    return oldSend.call(res, ...args);
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
publicRoutes.get(['/$versions', '/%24versions'], (_req: Request, res: Response) => {
  res.status(200).json({ versions: ['4.0'], default: '4.0' });
});

// SMART-on-FHIR configuration
// Medplum hosts the SMART well-known both at the root and at the /fhir/R4 paths.
// See: https://build.fhir.org/ig/HL7/smart-app-launch/conformance.html#sample-request
publicRoutes.get('/.well-known/smart-configuration', smartConfigurationHandler);
publicRoutes.get('/.well-known/smart-styles.json', smartStylingHandler);

// Protected routes require authentication
const protectedRoutes = Router().use(authenticateRequest);
fhirRouter.use(protectedRoutes);

// CSV Export (cannot use FhirRouter due to CSV output)
protectedRoutes.get(['/:resourceType/$csv', '/:resourceType/%24csv'], csvHandler);

// AI $ai operation - handled directly in Express routes to support streaming
protectedRoutes.post(['/$ai', '/%24ai'], aiOperationHandler);

// Agent $push operation (cannot use FhirRouter due to HL7 and DICOM output)
protectedRoutes.post(['/Agent/$push', '/Agent/%24push'], agentPushHandler);
protectedRoutes.post(['/Agent/:id/$push', '/Agent/:id/%24push'], agentPushHandler);

// Bot $execute operation
// Allow extra path content after the "$execute" to support external callers who append path info
const botPaths = [
  '/Bot/$execute',
  '/Bot/%24execute',
  '/Bot/:id/$execute',
  '/Bot/:id/%24execute',
  '/Bot/$execute/*splat',
  '/Bot/%24execute/*splat',
  '/Bot/:id/$execute/*splat',
  '/Bot/:id/%24execute/*splat',
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

  // Update User email
  router.add('POST', '/User/:id/$update-email', updateUserEmailOperation);

  // ConceptMap $translate
  router.add('GET', '/ConceptMap/$translate', conceptMapTranslateHandler);
  router.add('POST', '/ConceptMap/$translate', conceptMapTranslateHandler);
  router.add('GET', '/ConceptMap/:id/$translate', conceptMapTranslateHandler);
  router.add('POST', '/ConceptMap/:id/$translate', conceptMapTranslateHandler);

  // ConceptMap $import
  router.add('POST', '/ConceptMap/$import', conceptMapImportHandler);
  router.add('POST', '/ConceptMap/:id/$import', conceptMapImportHandler);

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

  // Agent $fetch-logs operation
  router.add('GET', '/Agent/$fetch-logs', agentFetchLogsHandler);
  router.add('GET', '/Agent/:id/$fetch-logs', agentFetchLogsHandler);

  // AsyncJob $cancel operation
  router.add('POST', '/AsyncJob/:id/$cancel', asyncJobCancelHandler);

  // Bot $deploy operation
  router.add('POST', '/Bot/:id/$deploy', deployHandler);

  // Claim $export operation
  router.add('POST', '/Claim/$export', claimExportPostHandler);
  router.add('GET', '/Claim/:id/$export', claimExportGetHandler);

  // Group $export operation
  router.add('GET', '/Group/:id/$export', groupExportHandler);
  router.add('POST', '/Group/:id/$export', groupExportHandler);

  // Patient $export operation
  router.add('GET', '/Patient/$export', patientExportHandler);
  router.add('POST', '/Patient/$export', patientExportHandler);

  // Measure $evaluate-measure operation
  router.add('POST', '/Measure/:id/$evaluate-measure', evaluateMeasureHandler);

  // PlanDefinition $apply operation
  router.add('POST', '/PlanDefinition/:id/$apply', planDefinitionApplyHandler);

  // ChargeItemDefinition $apply operation
  router.add('POST', '/ChargeItemDefinition/:id/$apply', chargeItemDefinitionApplyHandler);

  // Resource $graph operation
  router.add('GET', '/:resourceType/:id/$graph', resourceGraphHandler);

  // Resource $set-accounts operation
  router.add('POST', '/:resourceType/:id/$set-accounts', setAccountsHandler);

  // Patient $everything operation
  router.add('GET', '/Patient/:id/$everything', patientEverythingHandler);
  router.add('POST', '/Patient/:id/$everything', patientEverythingHandler);

  // Patient $summary operation
  router.add('GET', '/Patient/:id/$summary', patientSummaryHandler);
  router.add('POST', '/Patient/:id/$summary', patientSummaryHandler);

  // Patient $ccda-export operation
  router.add('GET', '/Patient/:id/$ccda-export', ccdaExportHandler);
  router.add('POST', '/Patient/:id/$ccda-export', ccdaExportHandler);

  // QuestionnaireResponse $extract operation
  router.add('GET', '/QuestionnaireResponse/:id/$extract', extractHandler);
  router.add('POST', '/QuestionnaireResponse/:id/$extract', extractHandler);
  router.add('POST', '/QuestionnaireResponse/$extract', extractHandler);

  // $expunge operation
  router.add('POST', '/:resourceType/:id/$expunge', expungeHandler);

  // $get-ws-binding-token operation
  router.add('GET', '/Subscription/:id/$get-ws-binding-token', getWsBindingTokenHandler);

  // StructureDefinition $expand-profile operation
  router.add('POST', '/StructureDefinition/$expand-profile', structureDefinitionExpandProfileHandler);

  // ClientApplication $launch
  router.add('GET', '/ClientApplication/:id/$smart-launch', appLaunchHandler);
  // Rotate client secret
  router.add('POST', '/ClientApplication/:id/$rotate-secret', rotateSecretHandler);

  // AWS operations
  router.add('POST', '/:resourceType/:id/$aws-textract', awsTextractHandler);

  // Schedule $find operation
  router.add('GET', '/Schedule/:id/$find', scheduleFindHandler);

  // Validate create resource
  router.add('POST', '/:resourceType/$validate', async (req: FhirRequest) => {
    const ctx = getAuthenticatedContext();
    await ctx.repo.validateResourceStrictly(req.body);
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
  router.add('POST', '/$db-schema-diff', dbSchemaDiffHandler);
  router.add('POST', '/$db-invalid-indexes', dbInvalidIndexesHandler);
  router.add('POST', '/$explain', dbExplainHandler);
  router.add('GET', '/$db-indexes', dbIndexesHandler);
  router.add('POST', '/$db-configure-indexes', dbConfigureIndexesHandler);

  router.addEventListener('warn', (e: any) => {
    const ctx = getAuthenticatedContext();
    ctx.logger.warn(e.message, { ...e.data, project: ctx.project.id });
  });

  router.addEventListener('batch', (event: any) => {
    const ctx = getAuthenticatedContext();
    const projectId = ctx.project.id;
    const { count, errors, size, bundleType } = event as BatchEvent;

    const metricOpts = { attributes: { bundleType, projectId } };
    if (count !== undefined) {
      recordHistogramValue('medplum.batch.entries', count, metricOpts);
    }
    if (errors?.length) {
      recordHistogramValue('medplum.batch.errors', errors.length, metricOpts);
      ctx.logger.warn('Error processing batch', { bundleType, count, errors, size, project: projectId });
    }
    if (size !== undefined) {
      recordHistogramValue('medplum.batch.size', size, metricOpts);
    }
  });

  return router;
}

// Default route
protectedRoutes.use('{*splat}', async function routeFhirRequest(req: Request, res: Response) {
  const ctx = getAuthenticatedContext();

  const request: FhirRequest = {
    method: req.method as HttpMethod,
    url: stripPrefix(req.originalUrl, '/fhir/R4'),
    pathname: '',
    params: req.params,
    query: Object.create(null), // Defer query param parsing to router for consistency
    // Express v5 changed the default value of `req.body` from {} to undefined. A decent number of FHIR handlers
    // rely on the previous behavior, so we defer handling undefined for now
    body: req.body ?? {},
    headers: req.headers,
    config: {
      graphqlBatchedSearchSize: ctx.project.systemSetting?.find((s) => s.name === 'graphqlBatchedSearchSize')
        ?.valueInteger,
      graphqlMaxDepth: ctx.project.systemSetting?.find((s) => s.name === 'graphqlMaxDepth')?.valueInteger,
      graphqlMaxSearches: ctx.project.systemSetting?.find((s) => s.name === 'graphqlMaxSearches')?.valueInteger,
      searchOnReader: ctx.project.systemSetting?.find((s) => s.name === 'searchOnReader')?.valueBoolean,
      transactions: ctx.project.features?.includes('transaction-bundles'),
    },
  };

  let result = await getInternalFhirRouter().handleRequest(request, ctx.repo);

  if (isNotFound(result[0])) {
    const customOperationResponse = await tryCustomOperation(request, ctx.repo);
    if (customOperationResponse) {
      result = customOperationResponse;
    }
  }

  if (result.length === 1) {
    if (!isOk(result[0])) {
      throw new OperationOutcomeError(result[0]);
    }
    sendOutcome(res, result[0]);
    return;
  }

  await sendFhirResponse(req, res, result[0], result[1], result[2]);
});

function stripPrefix(str: string, prefix: string): string {
  return str.substring(str.indexOf(prefix) + prefix.length);
}

// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { BatchEvent, FhirRouter } from '@medplum/fhir-router';
import { getAuthenticatedContext } from '../context';
import { recordHistogramValue } from '../otel/otel';

/**
 * Subscribes the logging and metrics listeners to a FHIR router.
 *
 * Lives apart from `routes.ts` so the batch workers can subscribe without importing the whole
 * route table, and so that a router built for a restricted purpose can gain telemetry without
 * also gaining routes.
 *
 * Requires an authenticated context, which the workers establish via `runInAuthenticatedContext`.
 * @param router - The router to subscribe to.
 */
export function addBatchTelemetryListeners(router: FhirRouter): void {
  router.addEventListener('batch', (e: any) => {
    const ctx = getAuthenticatedContext();
    const projectId = ctx.project.id;
    const { count, errors, errorCount, size, bundleType } = e as BatchEvent;

    // It would be nice to include projectId as an attribute, but some metrics destinations
    // charge per unique attribute combination, so omit projectId to avoid extra costs
    const metricOpts = { attributes: { bundleType } };
    if (count !== undefined) {
      recordHistogramValue('medplum.batch.entries', count, metricOpts);
    }
    // Async batches report a count rather than messages: a resumed job's processor only holds the
    // errors from its own run, so the count is taken from the fully assembled response bundle.
    const totalErrors = errorCount ?? errors?.length;
    if (totalErrors) {
      recordHistogramValue('medplum.batch.errors', totalErrors, metricOpts);
      ctx.logger.warn('Error processing batch', { bundleType, count, errors, totalErrors, size, project: projectId });
    }
    if (size !== undefined) {
      recordHistogramValue('medplum.batch.size', size, metricOpts);
    }
  });
}

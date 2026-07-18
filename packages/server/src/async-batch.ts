// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { accepted, badRequest, OperationOutcomeError } from '@medplum/core';
import type { Bundle, Project } from '@medplum/fhirtypes';
import type { NextFunction, Request, Response } from 'express';
import { json } from 'express';
import { JSON_TYPE, runMiddleware } from './app';
import { getConfig } from './config/loader';
import type { MedplumServerConfig } from './config/types';
import { getAuthenticatedContext } from './context';
import { AsyncJobExecutor } from './fhir/operations/utils/asyncjobexecutor';
import { sendOutcome } from './fhir/outcomes';
import { queueBatchProcessing, queueLegacyBatchProcessing } from './workers/batch';

export function asyncBatchHandler(
  config: MedplumServerConfig
): (req: Request, res: Response, next: NextFunction) => Promise<any> {
  return async function (req: Request, res: Response, next: NextFunction): Promise<any> {
    const { repo, project } = getAuthenticatedContext();
    if (req.get('prefer') !== 'respond-async') {
      next();
      return;
    }

    await runMiddleware(req, res, json({ type: JSON_TYPE, limit: config.maxBatchSize }));
    if (req.body.resourceType !== 'Bundle') {
      throw new OperationOutcomeError(badRequest('Expected request body to be a Bundle'));
    }
    const bundle = req.body as Bundle;

    if (bundle.type === 'transaction' && project.features?.includes('transaction-bundles')) {
      throw new OperationOutcomeError(
        badRequest('Transaction batches cannot be executed asynchronously', 'Bundle.type')
      );
    }

    const exec = new AsyncJobExecutor(repo);
    await exec.init(`${req.protocol}://${req.get('host') + req.originalUrl}`);
    await exec.run(async (asyncJob) => {
      if (useLegacyBatchProcessing(project)) {
        await queueLegacyBatchProcessing(bundle, asyncJob);
      } else {
        await queueBatchProcessing(bundle, asyncJob);
      }
    });

    const { baseUrl } = getConfig();
    sendOutcome(res, accepted(exec.getContentLocation(baseUrl)));
  };
}

function useLegacyBatchProcessing(project: Project): boolean {
  // Projects must opt-out of reentrant async batch processing
  return project.systemSetting?.find((s) => s.name === 'reentrantAsyncBatch')?.valueBoolean === false;
}

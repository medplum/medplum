// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { accepted, allOk, isOk } from '@medplum/core';
import { FhirRequest, HttpMethod } from '@medplum/fhir-router';
import { AsyncJob, OperationOutcome } from '@medplum/fhirtypes';
import { Request, Response, Router } from 'express';
import { asyncWrap } from '../async';
import { getConfig } from '../config/loader';
import { getAuthenticatedContext } from '../context';
import { asyncJobCancelHandler } from './operations/asyncjobcancel';
import { AsyncJobExecutor } from './operations/utils/asyncjobexecutor';
import { sendOutcome } from './outcomes';
import { sendFhirResponse } from './response';

// Asychronous Job Status API
// https://hl7.org/fhir/async-bundle.html

export const jobRouter = Router();

const finalJobStatusCodes = ['completed', 'error'];

jobRouter.get(
  '/:id/status',
  asyncWrap(async (req: Request, res: Response) => {
    const ctx = getAuthenticatedContext();
    const { id } = req.params;
    const asyncJob = await ctx.repo.readResource<AsyncJob>('AsyncJob', id);

    let outcome: OperationOutcome;
    if (!finalJobStatusCodes.includes(asyncJob.status as string)) {
      const exec = new AsyncJobExecutor(ctx.repo, asyncJob);
      outcome = accepted(exec.getContentLocation(getConfig().baseUrl));
    } else {
      outcome = allOk;
    }

    return sendFhirResponse(req, res, outcome, asyncJob);
  })
);

jobRouter.delete(
  '/:id/status',
  asyncWrap(async (req: Request, res: Response) => {
    let normalizedOutcome: OperationOutcome;
    const request: FhirRequest = {
      method: req.method as HttpMethod,
      url: req.originalUrl.replace('/fhir/R4', ''),
      pathname: '',
      params: req.params,
      query: {},
      body: req.body,
      headers: req.headers,
    };
    const [outcome] = await asyncJobCancelHandler(request);
    if (isOk(outcome)) {
      // We need an `accepted` outcome without the location set since the spec for async requests only wants the 202 header
      // And an optional OperationOutcome body
      // Source: https://www.hl7.org/fhir/R4/async.html#3.1.6.3.0.2
      /* 3.1.6.3.0.2 Response - Success
       * HTTP Status Code of 202 Accepted
       * Optionally a FHIR OperationOutcome in the body
       */
      normalizedOutcome = {
        resourceType: 'OperationOutcome',
        id: 'accepted',
        issue: [
          {
            severity: 'information',
            code: 'informational',
            details: {
              text: 'Accepted',
            },
          },
        ],
      };
    } else {
      normalizedOutcome = outcome;
    }
    sendOutcome(res, normalizedOutcome);
  })
);

// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { badRequest, concatUrls, redirect } from '@medplum/core';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import type { ClientApplication, SmartAppLaunch } from '@medplum/fhirtypes';
import { getConfig } from '../../config/loader';
import { getAuthenticatedContext } from '../../context';
import { makeOperationDefinition } from './definitions';
import { parseInputParameters } from './utils/parameters';

const operation = makeOperationDefinition(
  { scope: 'instance', resource: 'ClientApplication' },
  {
    name: 'clientapplication-smart-launch',
    code: 'smart-launch',
    parameter: [
      { use: 'in', name: 'patient', type: 'uuid', min: 0, max: '1' },
      { use: 'in', name: 'encounter', type: 'uuid', min: 0, max: '1' },
    ],
  }
);

type LaunchOperationParameters = {
  patient?: string;
  encounter?: string;
};

export async function appLaunchHandler(req: FhirRequest): Promise<FhirResponse> {
  const ctx = getAuthenticatedContext();
  if (!req.params.id) {
    return [badRequest('ClientApplication to launch must be specified')];
  }

  const params = parseInputParameters<LaunchOperationParameters>(operation, req);

  const clientApp = await ctx.repo.readResource<ClientApplication>('ClientApplication', req.params.id);

  if (!clientApp.launchUri) {
    return [badRequest('ClientApplication not configured for launch')];
  }
  if (params.patient && params.encounter) {
    return [badRequest('Only one launch context can be specified')];
  }

  const launch = await ctx.repo.createResource<SmartAppLaunch>({
    resourceType: 'SmartAppLaunch',
    patient: params.patient ? { reference: `Patient/${params.patient}` } : undefined,
    encounter: params.encounter ? { reference: `Encounter/${params.encounter}` } : undefined,
  });

  const url = new URL(clientApp.launchUri);
  url.searchParams.set('iss', concatUrls(getConfig().baseUrl, 'fhir/R4/'));
  url.searchParams.set('launch', launch.id);

  return [redirect(url)];
}

// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { badRequest, concatUrls, redirect } from '@medplum/core';
import { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import { ClientApplication, OperationDefinition, SmartAppLaunch } from '@medplum/fhirtypes';
import { getConfig } from '../../config/loader';
import { getAuthenticatedContext } from '../../context';
import { getSystemRepo } from '../repo';
import { parseInputParameters } from './utils/parameters';

const operation: OperationDefinition = {
  resourceType: 'OperationDefinition',
  name: 'clientapplication-smart-launch',
  status: 'active',
  kind: 'operation',
  code: 'smart-launch',
  experimental: true,
  resource: ['ClientApplication'],
  system: false,
  type: false,
  instance: true,
  parameter: [
    { use: 'in', name: 'patient', type: 'uuid', min: 0, max: '1' },
    { use: 'in', name: 'encounter', type: 'uuid', min: 0, max: '1' },
  ],
};

type LaunchOperationParameters = {
  patient?: string;
  encounter?: string;
};

export async function appLaunchHandler(req: FhirRequest): Promise<FhirResponse> {
  if (!req.params.id) {
    return [badRequest('ClientApplication to launch must be specified')];
  }

  const params = parseInputParameters<LaunchOperationParameters>(operation, req);

  const clientApp = await getSystemRepo().readResource<ClientApplication>('ClientApplication', req.params.id);

  if (!clientApp.launchUri) {
    return [badRequest('ClientApplication not configured for launch')];
  }
  if (params.patient && params.encounter) {
    return [badRequest('Only one launch context can be specified')];
  }

  const launch = await getAuthenticatedContext().repo.createResource<SmartAppLaunch>({
    resourceType: 'SmartAppLaunch',
    patient: params.patient ? { reference: `Patient/${params.patient}` } : undefined,
    encounter: params.encounter ? { reference: `Encounter/${params.encounter}` } : undefined,
  });

  const url = new URL(clientApp.launchUri);
  url.searchParams.set('iss', concatUrls(getConfig().baseUrl, 'fhir/R4/'));
  url.searchParams.set('launch', launch.id);

  return [redirect(url)];
}

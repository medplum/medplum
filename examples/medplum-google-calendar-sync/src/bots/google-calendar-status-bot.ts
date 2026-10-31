// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { operationHandler } from '../common/contracts';
import type { BotEvent, MedplumClient } from '@medplum/core';
import type { Parameters } from '@medplum/fhirtypes';
import { callerStatus } from '../common/public-status';
import { requirePractitionerRequester } from '../common/operations';

async function execute(medplum: MedplumClient, event: BotEvent<Parameters>): Promise<Parameters> {
  const practitioner = requirePractitionerRequester(event);
  const profile = await medplum.getProfileAsync();
  if (`${profile?.resourceType}/${profile?.id}` !== practitioner) {
    throw new Error('Status must run as the caller');
  }
  return callerStatus(medplum, practitioner);
}

export const handler = operationHandler('status', execute);

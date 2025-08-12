// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MedplumClient } from '@medplum/core';
import { ClientApplication } from '@medplum/fhirtypes';
import { randomUUID } from 'node:crypto';

const medplum = new MedplumClient();

const clientApplication: ClientApplication & { id: string } = {
  resourceType: 'ClientApplication',
  id: randomUUID(),
  secret: randomUUID(),
};

// start-block rotate
// First, rotate the initial secret
const rotatedClient: ClientApplication = await medplum.post(
  medplum.fhirUrl('ClientApplication', clientApplication.id, '$rotate-secret'),
  {
    resourceType: 'Parameters',
    parameter: [{ name: 'secret', valueString: clientApplication.secret }],
  }
);
console.log('Client secret rotated; new secret is:', rotatedClient.secret);
console.log('Previous secret is still available for use:', rotatedClient.retiringSecret);
// At this point, existing application instances should be updated to use the new secret

// Once all use of the old (retiring) secret is resolved, rotate it out of service
await medplum.post(medplum.fhirUrl('ClientApplication', clientApplication.id, '$rotate-secret'), {
  resourceType: 'Parameters',
  parameter: [{ name: 'retiringSecret', valueString: rotatedClient.retiringSecret }],
});
// Now only the newly generated secret value will be valid
// end-block rotate

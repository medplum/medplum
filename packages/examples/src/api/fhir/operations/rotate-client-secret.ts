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
const result = await medplum.post(
  medplum.fhirUrl('ClientApplication', clientApplication.id, '$rotate-secret').toString(),
  {
    resourceType: 'Parameters',
    parameter: [{ name: 'secret', valueString: clientApplication.secret }],
  }
);
// end-block rotate

console.log(result);

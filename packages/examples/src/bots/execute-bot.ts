import { MedplumClient } from '@medplum/core';

const medplum = new MedplumClient();

async function executeById(id: string): Promise<void> {
  // start-block execute-by-id
  const result = await medplum.validateResource({
    resourceType: 'Patient',
    name: [{ given: ['Alice'], family: 'Smith' }],
  });
  // end-block execute-by-id
  console.log(result);
}

async function executeByIdentifier(system: string, value: string): Promise<void> {}

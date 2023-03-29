import { MedplumClient } from '@medplum/core';

const medplum = new MedplumClient();

export async function executeById(id: string): Promise<void> {
  // start-block execute-by-id
  const result = await medplum.executeBot(id, { input: '...' });
  console.log(result);
  // end-block execute-by-id
}

export async function executeByIdentifier(): Promise<void> {
  // start-block execute-by-identifier
  const result = await medplum.executeBot(
    {
      system: 'https://example.com/bots',
      value: '1234',
    },
    {
      input1: '...',
      input2: '...',
    }
  );
  console.log(result);
  // end-block execute-by-identifier
}

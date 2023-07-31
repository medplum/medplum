import { MedplumClient } from '@medplum/core';

const medplum = new MedplumClient();

export async function executeById(id: string): Promise<void> {
  // start-block execute-by-id
  const result = await medplum.executeBot(id, { input: { foo: 'bar' } });
  console.log(result);
  // end-block execute-by-id

  // start-block execute-by-id-get
  const getResult = await medplum.get(medplum.fhirUrl('Bot', id, '$execute').toString() + '?foo=bar');
  console.log(getResult);
  // end-block execute-by-id-get
}

export async function executeByIdentifier(): Promise<void> {
  // start-block execute-by-identifier
  const result = await medplum.executeBot(
    {
      system: 'https://example.com/bots',
      value: '1234',
    },
    {
      foo: 'bar',
    }
  );
  console.log(result);
  // end-block execute-by-identifier
  // start-block execute-by-identifier-get
  const getResult = await medplum.get(
    medplum.fhirUrl('Bot', '$execute').toString() + '?identifier=https://example.com/bots|1234&foo=bar'
  );
  console.log(getResult);
  // end-block execute-by-identifier-get
}

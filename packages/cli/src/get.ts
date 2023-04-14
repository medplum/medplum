import { MedplumClient, convertToTransactionBundle } from '@medplum/core';
import { prettyPrint, cleanUrl } from '.';

export async function get(medplum: MedplumClient, argv: string[]): Promise<void> {
  if (argv.length === 4) {
    prettyPrint(await medplum.get(cleanUrl(argv[3])));
    return;
  }

  const flag = argv[3];
  const response = await medplum.get(cleanUrl(argv[4]));

  flags(flag, response);
}

export function flags(flag: string, response: any): any {
  switch (flag) {
    case '--as-transaction':
      return prettyPrint(convertToTransactionBundle(response));
    default:
      console.log(`Unknown flag: ${flag}`);
      return;
  }
}

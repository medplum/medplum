import { MedplumClient, convertToTransactionBundle } from '@medplum/core';
import { prettyPrint, cleanUrl } from '.';

export async function get(medplum: MedplumClient, argv: string[]): Promise<void> {
  const response = await medplum.get(cleanUrl(argv[3]));

  if (argv.length === 4) {
    prettyPrint(response);
    return;
  }

  prettyPrint(flags(argv[4], response));
}

export function flags(flag: string, response: any): any {
  switch (flag) {
    case '--convertToTransactionBundle':
      return convertToTransactionBundle(response);
    default:
      console.log(`Unknown flag: ${flag}`);
      return;
  }
}

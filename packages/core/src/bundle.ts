import { Bundle } from '@medplum/fhirtypes';

/**
 * More on Bundles can be found here
 * http://hl7.org/fhir/R4/bundle.html
 */

/**
 * Takes a bundle and creates a Transaction Type bundle
 * @param bundle The Bundle object that we'll receive from the search query
 * @returns transaction type bundle
 */
export function convertToTransactionBundle(bundle: Bundle): Bundle {
  for (const entry of bundle.entry || []) {
    delete entry.resource?.meta;
    entry.fullUrl = 'urn:uuid:' + entry.resource?.id;
    delete entry.resource?.id;
  }
  const input = bundle.entry;
  const jsonString = JSON.stringify(
    {
      resourceType: 'Bundle',
      type: 'transaction',
      entry: input?.map((entry: any) => ({
        fullUrl: entry.fullUrl,
        request: { method: 'POST', url: entry.resource.resourceType },
        resource: entry.resource,
      })),
    },
    replacer,
    2
  );
  return JSON.parse(jsonString);
}

function replacer(key: string, value: string): string {
  if (key === 'reference' && typeof value === 'string' && value.includes('/')) {
    return 'urn:uuid:' + value.split('/')[1];
  }
  return value;
}

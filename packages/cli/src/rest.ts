import { convertToTransactionBundle } from '@medplum/core';
import { createMedplumCommand } from './util/command';
import { prettyPrint } from './utils';
import { createMedplumClient } from './util/client';

export const deleteObject = createMedplumCommand('delete');
export const get = createMedplumCommand('get');
export const patch = createMedplumCommand('patch');
export const post = createMedplumCommand('post');
export const put = createMedplumCommand('put');

deleteObject.argument('<url>', 'Resource/$id').action(async (url, options) => {
  const medplum = await createMedplumClient(options);
  prettyPrint(await medplum.delete(cleanUrl(url)));
});

get
  .argument('<url>', 'Resource/$id')
  .option('--as-transaction', 'Print out the bundle as a transaction type')
  .action(async (url, options) => {
    const medplum = await createMedplumClient(options);
    const response = await medplum.get(cleanUrl(url));
    if (options.asTransaction) {
      prettyPrint(convertToTransactionBundle(response));
    } else {
      prettyPrint(response);
    }
  });

patch.arguments('<url> <body>').action(async (url, body, options) => {
  const medplum = await createMedplumClient(options);

  prettyPrint(await medplum.patch(cleanUrl(url), parseBody(body)));
});

post.arguments('<url> <body>').action(async (url, body, options) => {
  const medplum = await createMedplumClient(options);

  prettyPrint(await medplum.post(cleanUrl(url), parseBody(body)));
});

put.arguments('<url> <body>').action(async (url, body, options) => {
  const medplum = await createMedplumClient(options);

  prettyPrint(await medplum.put(cleanUrl(url), parseBody(body)));
});

function parseBody(input: string | undefined): any {
  if (!input) {
    return undefined;
  }
  try {
    return JSON.parse(input);
  } catch (err) {
    return input;
  }
}

export function cleanUrl(input: string): string {
  const knownPrefixes = ['admin/', 'auth/', 'fhir/R4'];
  if (knownPrefixes.some((p) => input.startsWith(p))) {
    // If the URL starts with a known prefix, return it as-is
    return input;
  }
  // Otherwise, default to FHIR
  return 'fhir/R4/' + input;
}

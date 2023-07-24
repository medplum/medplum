import { convertToTransactionBundle } from '@medplum/core';
import { createMedplumCommand } from './util/command';
import { checkForProfile, prettyPrint } from './utils';
import { createMedplumClient } from './util/client';

export const deleteObject = createMedplumCommand('delete');
export const get = createMedplumCommand('get');
export const patch = createMedplumCommand('patch');
export const post = createMedplumCommand('post');
export const put = createMedplumCommand('put');

deleteObject.argument('<url>', 'Resource/$id').action(async (url, options) => {
  const medplum = await createMedplumClient(options);
  prettyPrint(await medplum.delete(cleanUrl(url, options)));
});

get
  .argument('<url>', 'Resource/$id')
  .option('--as-transaction', 'Print out the bundle as a transaction type')
  .action(async (url, options) => {
    if (!checkForProfile(options)) {
      return;
    }
    const medplum = await createMedplumClient(options, options.profile);
    const response = await medplum.get(cleanUrl(url, options));
    if (options.asTransaction) {
      prettyPrint(convertToTransactionBundle(response));
    } else {
      prettyPrint(response);
    }
  });

patch.arguments('<url> <body>').action(async (url, body, options) => {
  const medplum = await createMedplumClient(options);

  prettyPrint(await medplum.patch(cleanUrl(url, options), parseBody(body)));
});

post.arguments('<url> <body>').action(async (url, body, options) => {
  if (!checkForProfile(options)) {
    return;
  }
  const medplum = await createMedplumClient(options, options.profile);

  prettyPrint(await medplum.post(cleanUrl(url, options), parseBody(body)));
});

put.arguments('<url> <body>').action(async (url, body, options) => {
  const medplum = await createMedplumClient(options);

  prettyPrint(await medplum.put(cleanUrl(url, options), parseBody(body)));
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

export function cleanUrl(input: string, options: any): string {
  const knownPrefixes = ['admin/', 'auth/', 'fhir/R4'];
  const { fhirUrlPath } = options;
  if (knownPrefixes.some((p) => input.startsWith(p))) {
    // If the URL starts with a known prefix, return it as-is
    return input;
  }

  // when fhirUrlPath is specified
  if (fhirUrlPath) {
    return `${fhirUrlPath}/${input}`;
  }

  // Otherwise, default to FHIR
  return 'fhir/R4/' + input;
}

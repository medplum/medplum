// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { convertToTransactionBundle, MedplumClient } from '@medplum/core';
import { createMedplumClient } from './util/client';
import { MedplumCommand, prettyPrint } from './utils';

export const deleteObject = new MedplumCommand('delete');
export const get = new MedplumCommand('get');
export const patch = new MedplumCommand('patch');
export const post = new MedplumCommand('post');
export const put = new MedplumCommand('put');

deleteObject.argument('<url>', 'Resource/$id').action(async (url, options) => {
  const medplum = await createMedplumClient(options);
  prettyPrint(await medplum.delete(cleanUrl(medplum, url)));
});

get
  .argument('<url>', 'Resource/$id')
  .option('--as-transaction', 'Print out the bundle as a transaction type')
  .action(async (url, options) => {
    const medplum = await createMedplumClient(options);
    const response = await medplum.get(cleanUrl(medplum, url));
    if (options.asTransaction) {
      prettyPrint(convertToTransactionBundle(response));
    } else {
      prettyPrint(response);
    }
  });

patch.arguments('<url> <body>').action(async (url, body, options) => {
  const medplum = await createMedplumClient(options);

  prettyPrint(await medplum.patch(cleanUrl(medplum, url), parseBody(body)));
});

post
  .arguments('<url> <body>')
  .option('--prefer-async', 'Sets the Prefer header to "respond-async"')
  .action(async (url, body, options) => {
    const medplum = await createMedplumClient(options);

    const headers = options.preferAsync ? { Prefer: 'respond-async' } : undefined;
    prettyPrint(await medplum.post(cleanUrl(medplum, url), parseBody(body), undefined, { headers }));
  });

put.arguments('<url> <body>').action(async (url, body, options) => {
  const medplum = await createMedplumClient(options);

  prettyPrint(await medplum.put(cleanUrl(medplum, url), parseBody(body)));
});

function parseBody(input: string | undefined): any {
  if (!input) {
    return undefined;
  }
  try {
    return JSON.parse(input);
  } catch (_err) {
    return input;
  }
}

export function cleanUrl(medplum: MedplumClient, input: string): string {
  const knownPrefixes = ['admin/', 'auth/', 'fhir/R4'];
  if (knownPrefixes.some((p) => input.startsWith(p))) {
    // If the URL starts with a known prefix, return it as-is
    return input;
  }

  // Otherwise, default to FHIR
  return medplum.fhirUrl(input).toString();
}

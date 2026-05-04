// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { arrayify, badRequest, isReference, OperationOutcomeError } from '@medplum/core';
import type { Duration, Extension, Reference, Resource } from '@medplum/fhirtypes';
import type { WithPath } from './withpath';
import { filterWithPaths, getPath } from './withpath';

type Extensible = { extension?: Extension[] };

// Like core utils `getExtension`, but returns an array of all matching
// extensions instead of stopping after a single match is found. Returned
// extensions are decorated with `WithPath`.
export function getExtensions(extensible: WithPath<Extensible>, urlOrUrls: string | string[]): WithPath<Extension>[] {
  const [url, ...restUrls] = arrayify(urlOrUrls);
  if (!url) {
    return [];
  }
  const pathPrefix = `${getPath(extensible)}.extension`;
  const extensions = filterWithPaths(extensible.extension, (extension) => extension.url === url, pathPrefix);
  if (!restUrls.length) {
    return extensions;
  }
  return extensions.flatMap((extension) => getExtensions(extension, restUrls));
}

export function assertExtensionBoolean(
  extension: WithPath<Extension>
): asserts extension is WithPath<Extension> & { valueBoolean: boolean } {
  if (!('valueBoolean' in extension)) {
    throw new OperationOutcomeError(badRequest('Extension valueBoolean missing', getPath(extension)));
  }
  if (typeof extension.valueBoolean !== 'boolean') {
    throw new OperationOutcomeError(badRequest('Extension valueBoolean has wrong type', getPath(extension)));
  }
}

export function assertExtensionCode(
  extension: WithPath<Extension>
): asserts extension is WithPath<Extension> & { valueCode: string } {
  if (!('valueCode' in extension)) {
    throw new OperationOutcomeError(badRequest('Extension valueCode missing', getPath(extension)));
  }
  if (typeof extension.valueCode !== 'string') {
    throw new OperationOutcomeError(badRequest('Extension valueCode has wrong type', getPath(extension)));
  }
}

export function assertExtensionDuration(
  extension: WithPath<Extension>
): asserts extension is WithPath<Extension> & { valueDuration: Duration } {
  if (!('valueDuration' in extension)) {
    throw new OperationOutcomeError(badRequest('Extension valueDuration missing', getPath(extension)));
  }
}

export function assertExtensionReference<T extends Resource = Resource>(
  extension: WithPath<Extension>,
  resourceType?: T['resourceType']
): asserts extension is WithPath<Extension> & { valueReference: Reference<T> & { reference: string } } {
  if (!('valueReference' in extension)) {
    throw new OperationOutcomeError(badRequest('Extension valueReference missing', getPath(extension)));
  }
  if (!isReference(extension.valueReference, resourceType)) {
    throw new OperationOutcomeError(badRequest('Extension valueReference invalid', getPath(extension)));
  }
}

export function assertExtensionTime(
  extension: WithPath<Extension>
): asserts extension is WithPath<Extension> & { valueTime: string } {
  if (!('valueTime' in extension)) {
    throw new OperationOutcomeError(badRequest('Extension valueTime missing', getPath(extension)));
  }
  if (typeof extension.valueTime !== 'string') {
    throw new OperationOutcomeError(badRequest('Extension valueTime has wrong type', getPath(extension)));
  }
}

// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { arrayify, badRequest, isReference, OperationOutcomeError } from '@medplum/core';
import type { Duration, Extension, Reference, Resource } from '@medplum/fhirtypes';
import type { WithPath } from './withpath';
import { filterWithPaths, getPath } from './withpath';

/**
 * An interface describing anything that can have FHIR Extensions. This
 * includes FHIR `Resource` types (e.g. `Patient`, `Practitioner`, ...), but
 * also FHIR data types (e.g.  `Address`, `CodeableConcept`, ...).
 */
interface Extensible {
  extension?: Extension[];
}

/**
 * Returns Extensions by extension URL(s).
 *
 * Like core utils `getExtension`, but returns an array of all matching
 * extensions instead of stopping after a single match is found. Returned
 * extensions are decorated with `WithPath`, allowing pointers to the
 * source to be surfaced without re-searching.
 *
 * @example
 * ```typescript
 *   const obj = withPath({
 *     resourceType: 'Patient',
 *     extension: [
 *       { url: 'http://example.com/fhir/basic', valueString: 'abcde' },
 *       { url: 'http://example.com/fhir/complex', extension: [
 *         { url: 'subext-a', valueCode: 'foo' }
 *         { url: 'subext-b', valueReference: { reference: 'Patient/456' } }
 *         { url: 'subext-a', valueCode: 'bar' }
 *       ]}
 *     ]
 *   }, 'Parameters.patient');
 *
 *   const extensions = getExtensions(obj, ['http://example.com/fhir/complex', 'subext-a']);
 *   assert(extensions[0].valueCode === 'foo');
 *   assert(getPath(extensions[0]) === 'Parameters.patient.extension[1].extension[0]');
 * ```
 *
 * @param extensible - A WithPath<object> that may contain an `extension` key holding an Array of Extension objects
 * @param urlOrUrls - A string or string-array of extension URLs. If an array, each entry represents descending a level in a nested extension.
 * @returns WithPath<Extension[]> - Extension objects matching urlOrUrls, annotated with its path
 */
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

/**
 * Asserts that an Extension has a valueBoolean field present
 *
 * The extension to test should have been annotated using `withPath` so that we can
 * emit a useful error message if it does not match.
 *
 * @param extension - The extension to test
 */
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

/**
 * Asserts that an Extension has a valueCode field present
 *
 * The extension to test should have been annotated using `withPath` so that we can
 * emit a useful error message if it does not match.
 *
 * @param extension - The extension to test
 */
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

/**
 * Asserts that an Extension has a valueDuration field present
 *
 * The extension to test should have been annotated using `withPath` so that we can
 * emit a useful error message if it does not match.
 *
 * @param extension - The extension to test
 */
export function assertExtensionDuration(
  extension: WithPath<Extension>
): asserts extension is WithPath<Extension> & { valueDuration: Duration } {
  if (!('valueDuration' in extension)) {
    throw new OperationOutcomeError(badRequest('Extension valueDuration missing', getPath(extension)));
  }
  if (typeof extension.valueDuration !== 'object' || extension.valueDuration === null) {
    throw new OperationOutcomeError(badRequest('Extension valueDuration has wrong type', getPath(extension)));
  }
}

/**
 * Asserts that an Extension has a valueReference field present
 *
 * The extension to test should have been annotated using `withPath` so that we can
 * emit a useful error message if it does not match.
 *
 * You may pass a Resource subtype as a Type parameter to further refine the type.
 *
 * @example
 * ```typescript
 *   const ext = withPath({
 *     url: 'http://example.com/fhir/foo',
 *     valueReference: { reference: 'Patient/123' }
 *   }, 'Path.to.extension');
 *
 *   assertExtensionReference(ext);
 *   assertExtensionReference<Patient>(ext, 'Patient');
 * ```
 *
 * @param extension - The extension to test
 * @param resourceType - If present, also check that the reference is of the given type
 */
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

/**
 * Asserts that an Extension has a valueTime field present
 *
 * The extension to test should have been annotated using `withPath` so that we can
 * emit a useful error message if it does not match.
 *
 * @param extension - The extension to test
 */
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

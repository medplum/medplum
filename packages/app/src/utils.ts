import { ContentType, MedplumClient, resolveId } from '@medplum/core';
import { Patient, Reference, Resource, Specimen } from '@medplum/fhirtypes';

/**
 * Tries to return the patient for the given the resource.
 * @param resource - Any FHIR resource.
 * @returns The patient associated with the resource, if available.
 */
export function getPatient(resource: Resource): Patient | Reference<Patient> | undefined {
  if (resource.resourceType === 'Patient') {
    return resource;
  }
  if (
    resource.resourceType === 'DiagnosticReport' ||
    resource.resourceType === 'Encounter' ||
    resource.resourceType === 'Observation' ||
    resource.resourceType === 'ServiceRequest'
  ) {
    return resource.subject as Reference<Patient>;
  }
  return undefined;
}

/**
 * Tries to return the specimen for the given the resource.
 * @param resource - Any FHIR resource.
 * @returns The specimen associated with the resource, if available.
 */
export function getSpecimen(resource: Resource): Specimen | Reference<Specimen> | undefined {
  if (resource.resourceType === 'Specimen') {
    return resource;
  }
  if (resource.resourceType === 'Observation') {
    return resource.specimen;
  }
  if (resource.resourceType === 'DiagnosticReport' || resource.resourceType === 'ServiceRequest') {
    return resource.specimen?.[0];
  }
  return undefined;
}

/**
 * Returns the current project ID for the given client.
 * @param medplum - The Medplum client.
 * @returns The current project ID.
 */
export function getProjectId(medplum: MedplumClient): string {
  return resolveId(medplum.getActiveLogin()?.project) as string;
}

/**
 * Creates a Blob object from the JSON object given and downloads the object.
 * @param jsonString - The JSON string.
 * @param fileName - Optional file name. Default is based on current timestamp.
 */
export function exportJsonFile(jsonString: string, fileName?: string): void {
  const blobForExport = new Blob([jsonString], { type: ContentType.JSON });
  const url = URL.createObjectURL(blobForExport);

  const link = document.createElement('a');
  link.href = url;

  const linkName = fileName ?? new Date().toISOString().replace(/\D/g, '');
  link.download = `${linkName}.json`;

  document.body.appendChild(link);
  link.click();

  // Clean up the URL object
  URL.revokeObjectURL(url);
}

/**
 * Splits values of an array based on a predicate function
 * @param array - Array to be partitioned
 * @param predicate - predicate function for array elements
 * @returns An array containing two arrays: the elements that pass the predicate and then those that fail
 */
export function partition<T, PassType extends T>(
  array: T[],
  predicate: ((item: T) => boolean) | ((item: T) => item is PassType)
): [PassType[], T[]] {
  const pass: PassType[] = [];
  const fail: T[] = [];
  for (const elem of array) {
    (predicate(elem) ? pass : fail).push(elem);
  }
  return [pass, fail];
}

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
 * Sends a structured command to the iframe using postMessage.
 *
 * Normally postMessage implies global event listeners. This method uses
 * MessageChannel to create a message channel between the iframe and the parent.
 * @param frame - The receiving IFrame.
 * @param command - The command to send.
 * @returns Promise to the response from the IFrame.
 * @see https://advancedweb.hu/how-to-use-async-await-with-postmessage/
 */
export function sendCommand(frame: HTMLIFrameElement, command: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel();

    channel.port1.onmessage = ({ data }) => {
      channel.port1.close();
      if (data.error) {
        reject(data.error);
      } else {
        resolve(data.result);
      }
    };

    frame.contentWindow?.postMessage(command, 'https://codeeditor.medplum.com', [channel.port2]);
  });
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

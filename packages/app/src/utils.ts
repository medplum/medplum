import { MedplumClient, resolveId } from '@medplum/core';
import { Patient, Reference, Resource, Specimen } from '@medplum/fhirtypes';

/**
 * Tries to return the patient for the given the resource.
 * @param resource Any FHIR resource.
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
 * @param resource Any FHIR resource.
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
 *
 * See: https://advancedweb.hu/how-to-use-async-await-with-postmessage/
 *
 * @param frame The receiving IFrame.
 * @param command The command to send.
 * @returns Promise to the response from the IFrame.
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
 * @param medplum The Medplum client.
 * @returns The current project ID.
 */
export function getProjectId(medplum: MedplumClient): string {
  return resolveId(medplum.getActiveLogin()?.project) as string;
}

/**
 * This function reads the contents of the a JSON object, manipulates the object
 * to add UUIDs and other modifications, and then exports the
 * modified JSON object to a file.
 * @param blob The Blob object that we'll receive from the search query
 */
export function getFHIRBundle(entry: any): void {
  const uuidBundle = createBundleFromEntry(entry);
  exportJSONFile(uuidBundle);
}

/**
 * Manipulates the object to add UUIDs and other modifications,
 * and returns a modified JSON object that represents a FHIR
 * bundle. The modified JSON object has fullUrl property with
 * a value starting with urn:uuid: followed by the resource ID.
 * @param input
 * @returns JSON object as a string
 */
export function createBundleFromEntry(input: any): string {
  for (const entry of input) {
    delete entry.resource.meta;
    entry.fullUrl = 'urn:uuid:' + entry.resource.id;
    delete entry.resource.id;
  }
  return JSON.stringify(
    {
      resourceType: 'Bundle',
      type: 'transaction',
      entry: input.map((entry: any) => ({
        fullUrl: entry.fullUrl,
        request: { method: 'POST', url: entry.resource.resourceType },
        resource: entry.resource,
      })),
    },
    replacer,
    2
  );
}

/**
 * Creates a Blob object from the JSON object given and downloads the
 * object
 * @param json
 */
function exportJSONFile(json: any): void {
  const blobForExport = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blobForExport);

  const link = document.createElement('a');
  link.href = url;
  link.download = `${new Date().toISOString().replace(/\D/g, '')}.json`;
  document.body.appendChild(link);
  link.click();

  // Clean up the URL object
  URL.revokeObjectURL(url);
}

/**
 * Helper function used to modify the JSON object
 * @param key
 * @param value
 * @returns string
 */
function replacer(key: string, value: string): string {
  if (key === 'reference' && typeof value === 'string' && value.includes('/')) {
    return 'urn:uuid:' + value.split('/')[1];
  }
  return value;
}

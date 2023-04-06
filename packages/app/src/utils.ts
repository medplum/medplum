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

export async function getUUIDBundleData(blob: any): Promise<string> {
  const dictionary = await blobToJson(blob);
  const uuidBundle = cleanUpBundle(dictionary.entry);
  return uuidBundle;
}

export function cleanUpBundle(input: any): any {
  for (const entry of input) {
    const meta = entry.resource.meta;
    delete meta.versionId;
    delete meta.lastUpdated;
    if (Object.keys(meta).length === 0) {
      delete entry.resource.meta;
    }
  }

  return JSON.stringify(
    {
      resourceType: 'Bundle',
      type: 'transaction',
      entry: input.map((resource: any) => ({
        fullUrl: 'urn:uuid:' + resource.id,
        request: { method: 'POST', url: resource.resourceType },
        resource,
      })),
    },
    replacer,
    2
  );
}

export async function blobToJson(blob: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = function () {
      try {
        const json = JSON.parse(reader.result as any);
        resolve(json);
      } catch (error) {
        reject(error);
      }
    };
    reader.readAsText(blob);
  });
}

function replacer(key: any, value: any) {
  // Filtering out properties
  if (key === 'reference' && typeof value === 'string' && value.includes('/')) {
    // Input: "Patient/{id}"
    // Output: "urn:uuid:{id}"
    return 'urn:uuid:' + value.split('/')[1];
  }
  return value;
}

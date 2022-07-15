import { Patient, Reference, Resource, Specimen } from '@medplum/fhirtypes';

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

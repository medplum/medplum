import { Patient, Reference, Resource } from '@medplum/fhirtypes';

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

export function getRecaptcha(): Promise<string> {
  return new Promise((resolve) => {
    grecaptcha.ready(() => {
      grecaptcha.execute(process.env.RECAPTCHA_SITE_KEY as string, { action: 'submit' }).then(resolve);
    });
  });
}

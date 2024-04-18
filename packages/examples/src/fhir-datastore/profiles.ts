import { MedplumClient, validateResource } from '@medplum/core';
import { StructureDefinition } from '@medplum/fhirtypes';

// start-block profileMigration
// Version 2.0.0 of the profile
const updatedProfile: StructureDefinition = {
  resourceType: 'StructureDefinition',
  url: 'http://www.example.com/profile/foo-patient/2.0.0',
  name: 'Patient Profile',
  status: 'active',
  kind: 'resource',
  type: 'Resource',
  abstract: false,
};

const medplum = new MedplumClient();
// Get all the patients in the system
const allPatients = await medplum.searchResources('Patient');

// Loop through the patients
for (const patient of allPatients) {
  // Run the validation operation on each patient
  const res = validateResource(patient, { profile: updatedProfile });
  // If the patient passes validation, update the profile and the patient
  if (res.length === 0) {
    patient.meta ? (patient.meta.profile = [updatedProfile.url]) : (patient.meta = { profile: [updatedProfile.url] });
    await medplum.updateResource(patient);
  } else {
    // If the patient does not pass validation, implement custom logic to notify the relevant users to update.
    console.log(patient, res);
  }
}
// end-block profileMigration

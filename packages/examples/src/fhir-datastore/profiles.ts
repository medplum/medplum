import { MedplumClient, validateResource } from '@medplum/core';
import { Patient, StructureDefinition } from '@medplum/fhirtypes';

const medplum = new MedplumClient();

const patient: Patient =
  // start-block updateProfile
  // The initial profile represented on a patient resource
  {
    resourceType: 'Patient',
    meta: {
      profile: ['https://example.com/profiles/foo-patient/1.0.0'],
    },
  };

// Update your StructureDefinition
const updatedProfile: StructureDefinition = {
  resourceType: 'StructureDefinition',
  url: 'http://www.example.com/profiles/foo-patient/2.0.0',
  name: 'Patient Profile',
  status: 'active',
  kind: 'resource',
  type: 'Resource',
  abstract: false,
};

// Create the new profile
await medplum.createResource(updatedProfile);
// end-block updateProfile

// start-block profileMigration
// Get all the patients in the system
const allPatients = await medplum.searchResources('Patient');

// Loop through the patients
for (const patient of allPatients) {
  // Run the validation operation on each patient
  const res = validateResource(patient, { profile: updatedProfile });
  // If the patient passes validation, update the profile and the patient
  if (res.length !== 0) {
    if (patient.meta) {
      patient.meta.profile = [updatedProfile.url];
    } else {
      patient.meta = {
        profile: [updatedProfile.url],
      };
    }
    await medplum.updateResource(patient);
  } else {
    // If the patient does not pass validation, implement custom logic to notify the relevant users to update.
    console.log(patient, res);
  }
}
// end-block profileMigration

console.log(patient);

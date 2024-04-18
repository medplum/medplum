import { MedplumClient } from '@medplum/core';

// start-block profileMigration
// The profile string
const updatedProfile = 'http://www.example.com/patient-profile';
const medplum = new MedplumClient();
// Get all the patients in the system to validate
const allPatients = await medplum.searchResources('Patient');

// Loop through the patients
for (const patient of allPatients) {
  // Run the validation operation on each patient
  const res = await medplum.validateResource(patient);
  // If the patient passes validation, add the updated profile
  if (res.issue[0].details?.text === 'All OK') {
    patient.meta ? (patient.meta.profile = [updatedProfile]) : (patient.meta = { profile: [updatedProfile] });
  } else {
    // If the patient does not pass validation, implement custom logic to notify the relevant users to update.
    console.log(patient, res);
  }
}
// end-block profileMigration

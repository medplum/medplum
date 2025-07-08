import { BotEvent, MedplumClient } from '@medplum/core';
import { Bundle } from '@medplum/fhirtypes';
import { HealthieClient } from './healthie/client';
import { HEALTHIE_MEDICATION_ID_SYSTEM, HEALTHIE_USER_ID_SYSTEM } from './healthie/constants';
import { fetchMedications, convertHealthieMedicationToFhir } from './healthie/medication';
import { convertHealthiePatientToFhir, fetchHealthiePatients } from './healthie/patient';

export async function handler(medplum: MedplumClient, event: BotEvent): Promise<any> {
  const { HEALTHIE_API_URL, HEALTHIE_CLIENT_SECRET } = event.secrets;
  if (!HEALTHIE_API_URL?.valueString) {
    throw new Error('HEALTHIE_API_URL must be set');
  }
  if (!HEALTHIE_CLIENT_SECRET?.valueString) {
    throw new Error('HEALTHIE_CLIENT_SECRET must be set');
  }

  const healthie = new HealthieClient(HEALTHIE_API_URL.valueString, HEALTHIE_CLIENT_SECRET.valueString);

  // Create a FHIR Bundle to store all patient resources
  // This will be used for a batch operation to create/update patients in Medplum
  const bundle: Bundle = {
    resourceType: 'Bundle',
    type: 'batch',
    entry: [],
  };

  // Fetch patients from Healthie
  // Fetch all patients from the Healthie API
  const healthiePatients = await fetchHealthiePatients(healthie);

  // Process each Healthie patient and convert to FHIR Patient resources
  for (const healthiePatient of healthiePatients) {
    // Add the patient to the bundle as a PUT operation
    // Using PUT with an identifier query ensures we update existing patients
    bundle.entry?.push({
      resource: convertHealthiePatientToFhir(healthiePatient),
      request: {
        method: 'PUT',
        url: `Patient?identifier=${HEALTHIE_USER_ID_SYSTEM}|${healthiePatient.id}`,
      },
    });
  }

  // Execute the batch operation to create/update all patients at once
  if (bundle.entry?.length) {
    await medplum.executeBatch(bundle);
  } else {
    console.warn('No patients to create/update');
  }

  // Fetch medications for each patient
  console.log(`Syncing Medications for ${healthiePatients.length} Healthie Patients`);
  for (const healthiePatient of healthiePatients) {
    const medicationBundle: Bundle = {
      resourceType: 'Bundle',
      type: 'batch',
      entry: [],
    };
    const medications = await fetchMedications(healthie, healthiePatient.id);
    for (const medication of medications) {
      medicationBundle.entry?.push({
        resource: convertHealthieMedicationToFhir(medication, healthiePatient.id),
        request: {
          method: 'PUT',
          url: `MedicationRequest?identifier=${HEALTHIE_MEDICATION_ID_SYSTEM}|${medication.id}`,
        },
      });
    }

    // <You can add additional resources conversions here>

    if (medicationBundle.entry && medicationBundle.entry?.length > 0) {
      await medplum.executeBatch(medicationBundle);
    } else {
      console.log(`No medications to create/update for patient ${healthiePatient.id}`);
    }
  }
}

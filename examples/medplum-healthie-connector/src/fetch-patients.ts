import { BotEvent, MedplumClient } from '@medplum/core';
import { Bundle, ContactPoint, MedicationRequest, Patient } from '@medplum/fhirtypes';
import {
  HEALTHIE_MEDICATION_CODE_SYSTEM,
  HEALTHIE_MEDICATION_ID_SYSTEM,
  HEALTHIE_USER_ID_SYSTEM,
  HealthieClient,
  mapHealthieGender,
  parseDosage,
} from './healthie';

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
  const healthiePatients = await healthie.fetchPatients();

  // Process each Healthie patient and convert to FHIR Patient resources
  for (const healthiePatient of healthiePatients) {
    const telecom: ContactPoint[] = [];
    if (healthiePatient.phone_number) {
      telecom.push({
        system: 'phone',
        value: healthiePatient.phone_number,
      });
    }
    // Create a FHIR Patient resource from Healthie patient data
    const fhirPatient: Patient = {
      resourceType: 'Patient',
      // Add Healthie user ID as an identifier to link the systems
      identifier: [
        {
          system: HEALTHIE_USER_ID_SYSTEM,
          value: healthiePatient.id,
        },
      ],
      // Map patient name information
      name: [
        {
          given: [healthiePatient.first_name],
          family: healthiePatient.last_name,
        },
      ],

      telecom,

      // Map address information if available
      address:
        healthiePatient.locations && healthiePatient.locations.length > 0
          ? [
              {
                line: [healthiePatient.locations[0].line1],
                city: healthiePatient.locations[0].city,
                state: healthiePatient.locations[0].state,
                postalCode: healthiePatient.locations[0].zip,
                country: healthiePatient.locations[0].country,
              },
            ]
          : undefined,
      // Map gender with appropriate transformation
      gender: healthiePatient.gender ? mapHealthieGender(healthiePatient.gender) : undefined,
    };

    // Add the patient to the bundle as a PUT operation
    // Using PUT with an identifier query ensures we update existing patients
    bundle.entry?.push({
      resource: fhirPatient,
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

  for (const patient of healthiePatients) {
    const medicationBundle: Bundle = {
      resourceType: 'Bundle',
      type: 'batch',
      entry: [],
    };
    const medications = await healthie.fetchMedications(patient.id);
    for (const medication of medications) {
      const fhirMedication: MedicationRequest = {
        resourceType: 'MedicationRequest',
        identifier: [{ system: HEALTHIE_MEDICATION_ID_SYSTEM, value: medication.id }],
        // TODO: Modify this code to use the following logic
        // If medication.active is true
        //   current date after end date: completed
        //   current date is before start date: 'draft'
        // If medication.active is false, then status is unknown
        status: medication.active ? 'active' : 'unknown',
        intent: 'proposal',
        subject: {
          reference: `Patient?identifier=${HEALTHIE_USER_ID_SYSTEM}|${patient.id}`,
        },
        medicationCodeableConcept: {
          text: medication.name,
          coding: [
            {
              system: HEALTHIE_MEDICATION_CODE_SYSTEM,
              code: medication.code || undefined,
              display: medication.name,
            },
          ],
        },
        // Add dosage instructions if available
        dosageInstruction: medication.dosage
          ? [
              {
                doseAndRate: [
                  {
                    doseQuantity: parseDosage(medication.dosage),
                  },
                ],
              },
            ]
          : undefined,
        note: medication.comment ? [{ text: medication.comment }] : undefined,
      };

      medicationBundle.entry?.push({
        resource: fhirMedication,
        request: {
          method: 'PUT',
          url: `MedicationRequest?identifier=${HEALTHIE_MEDICATION_ID_SYSTEM}|${medication.id}`,
        },
      });
    }
    if (medicationBundle.entry && medicationBundle.entry?.length > 0) {
      await medplum.executeBatch(medicationBundle);
    } else {
      console.log(`No medications to create/update for patient ${patient.id}`);
    }
  }
}

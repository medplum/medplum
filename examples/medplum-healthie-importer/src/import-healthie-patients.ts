import { BotEvent, createReference, generateId, MedplumClient } from '@medplum/core';
import { Bundle, Patient, Reference } from '@medplum/fhirtypes';
import { convertHealthieAllergyToFhir, fetchAllergySensitivities } from './healthie/allergy';
import { HealthieClient } from './healthie/client';
import {
  HEALTHIE_ALLERGY_ID_SYSTEM,
  HEALTHIE_FORM_ANSWER_GROUP_ID_SYSTEM,
  HEALTHIE_MEDICATION_ID_SYSTEM,
  HEALTHIE_USER_ID_SYSTEM,
} from './healthie/constants';
import { convertHealthieMedicationToFhir, fetchMedications } from './healthie/medication';
import { convertHealthiePatientToFhir, fetchHealthiePatientIds, fetchHealthiePatients } from './healthie/patient';
import { convertHealthieFormAnswerGroupToFhir, fetchHealthieFormAnswerGroups } from './healthie/questionnaire-response';

interface ImportHealthiePatientsInput {
  count?: number;
  offset?: number;
  patientIds?: string[];
}

export async function handler(medplum: MedplumClient, event: BotEvent<ImportHealthiePatientsInput>): Promise<any> {
  const { HEALTHIE_API_URL, HEALTHIE_CLIENT_SECRET } = event.secrets;
  const { count, offset, patientIds } = event.input;

  if (!HEALTHIE_API_URL?.valueString) {
    throw new Error('HEALTHIE_API_URL must be set');
  }
  if (!HEALTHIE_CLIENT_SECRET?.valueString) {
    throw new Error('HEALTHIE_CLIENT_SECRET must be set');
  }

  const healthie = new HealthieClient(HEALTHIE_API_URL.valueString, HEALTHIE_CLIENT_SECRET.valueString);

  // Fetch all patients from the Healthie API
  const healthiePatientIds = patientIds || (await fetchHealthiePatientIds(healthie, { count, offset }));
  console.log(`Found ${healthiePatientIds.length} Healthie patients to sync`);

  // Process each patient individually with their own bundle
  for (const healthiePatientId of healthiePatientIds) {
    try {
      console.log(`Processing Healthie patient ${healthiePatientId}`);

      // Create a FHIR Bundle for this specific patient
      const patientBundle: Bundle = {
        resourceType: 'Bundle',
        type: 'batch',
        entry: [],
      };

      const healthiePatient = (await fetchHealthiePatients(healthie, [healthiePatientId]))[0];
      if (!healthiePatient) {
        console.log(`Healthie patient ${healthiePatientId} not found`);
        continue;
      }

      // Add the patient resource to the bundle
      const fhirPatient = convertHealthiePatientToFhir(healthiePatient);
      const patientReference = {
        ...createReference(fhirPatient),
        reference: `urn:uuid:${generateId()}`,
      } satisfies Reference<Patient>;

      patientBundle.entry?.push({
        resource: fhirPatient,
        fullUrl: patientReference.reference,
        request: {
          method: 'PUT',
          url: `Patient?identifier=${HEALTHIE_USER_ID_SYSTEM}|${healthiePatient.id}`,
        },
      });

      // Fetch and add all medications for this patient
      const medications = await fetchMedications(healthie, healthiePatient.id);
      console.log(`Found ${medications.length} medications for patient ${healthiePatient.id}`);

      for (const medication of medications) {
        patientBundle.entry?.push({
          resource: convertHealthieMedicationToFhir(medication, patientReference),
          request: {
            method: 'PUT',
            url: `MedicationRequest?identifier=${HEALTHIE_MEDICATION_ID_SYSTEM}|${medication.id}`,
          },
        });
      }

      // Fetch and add all allergies for this patient
      const allergies = await fetchAllergySensitivities(healthie, healthiePatient.id);
      console.log(`Found ${allergies.length} allergies for patient ${healthiePatient.id}`);

      for (const allergy of allergies) {
        patientBundle.entry?.push({
          resource: convertHealthieAllergyToFhir(allergy, patientReference),
          request: {
            method: 'PUT',
            url: `AllergyIntolerance?identifier=${HEALTHIE_ALLERGY_ID_SYSTEM}|${allergy.id}`,
          },
        });
      }

      // Fetch and add all questionnaire responses for this patient
      const questionnaireResponses = await fetchHealthieFormAnswerGroups(healthiePatient.id, healthie);
      console.log(`Found ${questionnaireResponses.length} questionnaire responses for patient ${healthiePatient.id}`);

      for (const questionnaireResponse of questionnaireResponses) {
        patientBundle.entry?.push({
          resource: convertHealthieFormAnswerGroupToFhir(
            questionnaireResponse,
            HEALTHIE_API_URL.valueString,
            patientReference
          ),
          request: {
            method: 'PUT',
            url: `QuestionnaireResponse?identifier=${HEALTHIE_FORM_ANSWER_GROUP_ID_SYSTEM}|${questionnaireResponse.id}`,
          },
        });
      }

      // <You can add additional resources conversions here>

      // Execute the bundle for this patient
      if (patientBundle.entry && patientBundle.entry.length > 0) {
        const result = await medplum.executeBatch(patientBundle);
        console.log(
          result.entry?.forEach((e, index) => {
            if (!e.response?.status.startsWith('2')) {
              console.log(JSON.stringify(e.response, null, 2));
              console.log(JSON.stringify(patientBundle.entry?.[index]?.request, null, 2));
            }
          })
        );
        console.log(`Successfully synced patient ${healthiePatient.id} with ${patientBundle.entry.length} resources`);
      } else {
        console.log(`No resources to sync for patient ${healthiePatient.id}`);
      }
    } catch (error) {
      console.log(`Failed to sync patient ${healthiePatientId}:`, error);
      // Continue processing other patients even if one fails
    }
  }

  console.log('Patient sync process completed');
}

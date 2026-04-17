// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { createReference, generateId } from '@medplum/core';
import type { BotEvent, MedplumClient } from '@medplum/core';
import type { Bundle, Patient, Reference } from '@medplum/fhirtypes';
import { convertHealthieAllergyToFhir, fetchAllergySensitivities } from './healthie/allergy';
import { HealthieClient } from './healthie/client';
import {
  HEALTHIE_ALLERGY_ID_SYSTEM,
  HEALTHIE_DOCUMENT_ID_SYSTEM,
  HEALTHIE_FORM_ANSWER_GROUP_ID_SYSTEM,
  HEALTHIE_MEDICATION_ID_SYSTEM,
  HEALTHIE_POLICY_ID_SYSTEM,
  HEALTHIE_PROVIDER_ID_SYSTEM,
  HEALTHIE_PROVIDER_ROLE_ID_SYSTEM,
  HEALTHIE_USER_ID_SYSTEM,
} from './healthie/constants';
import { convertHealthiePolicyToFhir, fetchPolicies } from './healthie/coverage';
import {
  convertHealthieDocumentToFhir,
  downloadDocumentContent,
  fetchDocuments,
  shouldDownloadDocument,
} from './healthie/document';
import { convertHealthieMedicationToFhir, fetchMedications } from './healthie/medication';
import { convertHealthiePatientToFhir, fetchHealthiePatientIds, fetchHealthiePatients } from './healthie/patient';
import {
  convertHealthieProviderToPractitioner,
  convertHealthieProviderToPractitionerRole,
  fetchOrganizationMembers,
} from './healthie/provider';
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

  // Fetch and sync all providers (Practitioner + PractitionerRole)
  const providers = await fetchOrganizationMembers(healthie);
  console.log(`Found ${providers.length} active providers to sync`);

  if (providers.length > 0) {
    const providerBundle: Bundle = {
      resourceType: 'Bundle',
      type: 'batch',
      entry: [],
    };

    for (const provider of providers) {
      const practitioner = convertHealthieProviderToPractitioner(provider);
      const practitionerIdentifier = { system: HEALTHIE_PROVIDER_ID_SYSTEM, value: provider.id };

      providerBundle.entry?.push({
        resource: practitioner,
        request: {
          method: 'PUT',
          url: `Practitioner?identifier=${HEALTHIE_PROVIDER_ID_SYSTEM}|${provider.id}`,
        },
      });

      const practitionerRole = convertHealthieProviderToPractitionerRole(provider, practitionerIdentifier);
      providerBundle.entry?.push({
        resource: practitionerRole,
        request: {
          method: 'PUT',
          url: `PractitionerRole?identifier=${HEALTHIE_PROVIDER_ROLE_ID_SYSTEM}|${provider.id}`,
        },
      });
    }

    await medplum.executeBatch(providerBundle);
    console.log(`Successfully synced ${providers.length} providers`);
  }

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

      if (healthiePatient.dietitian_id) {
        fhirPatient.generalPractitioner = [
          {
            identifier: { system: HEALTHIE_PROVIDER_ID_SYSTEM, value: healthiePatient.dietitian_id },
          },
        ];
      }

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

      // Fetch all clinical data for this patient in parallel
      const [medications, allergies, questionnaireResponses, policies, documents] = await Promise.all([
        fetchMedications(healthie, healthiePatient.id),
        fetchAllergySensitivities(healthie, healthiePatient.id),
        fetchHealthieFormAnswerGroups(healthiePatient.id, healthie),
        fetchPolicies(healthie, healthiePatient.id),
        fetchDocuments(healthie, healthiePatient.id),
      ]);
      console.log(
        `Patient ${healthiePatient.id}: ${medications.length} meds, ${allergies.length} allergies, ` +
          `${questionnaireResponses.length} forms, ${policies.length} policies, ${documents.length} docs`
      );

      for (const medication of medications) {
        patientBundle.entry?.push({
          resource: convertHealthieMedicationToFhir(medication, patientReference),
          request: {
            method: 'PUT',
            url: `MedicationRequest?identifier=${HEALTHIE_MEDICATION_ID_SYSTEM}|${medication.id}`,
          },
        });
      }

      for (const allergy of allergies) {
        patientBundle.entry?.push({
          resource: convertHealthieAllergyToFhir(allergy, patientReference),
          request: {
            method: 'PUT',
            url: `AllergyIntolerance?identifier=${HEALTHIE_ALLERGY_ID_SYSTEM}|${allergy.id}`,
          },
        });
      }

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

      for (const policy of policies) {
        patientBundle.entry?.push({
          resource: convertHealthiePolicyToFhir(policy, patientReference),
          request: {
            method: 'PUT',
            url: `Coverage?identifier=${HEALTHIE_POLICY_ID_SYSTEM}|${policy.id}`,
          },
        });
      }

      for (const doc of documents) {
        const needsDownload = await shouldDownloadDocument(doc, medplum);
        if (!needsDownload) {
          continue;
        }

        const documentReference = convertHealthieDocumentToFhir(doc, patientReference);

        if (doc.expiring_url) {
          const downloaded = await downloadDocumentContent(doc.expiring_url);
          if (downloaded) {
            try {
              const createdBinary = await medplum.createBinary({
                data: downloaded.data,
                contentType: doc.file_content_type || downloaded.contentType,
                filename: doc.display_name || `document-${doc.id}`,
              });
              documentReference.content[0].attachment.url = `Binary/${createdBinary.id}`;
            } catch (error) {
              console.log(`Failed to upload binary for document ${doc.id}:`, error);
            }
          }
        }

        patientBundle.entry?.push({
          resource: documentReference,
          request: {
            method: 'PUT',
            url: `DocumentReference?identifier=${HEALTHIE_DOCUMENT_ID_SYSTEM}|${doc.id}`,
          },
        });
      }

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

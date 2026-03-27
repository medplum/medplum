// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { createReference, generateId } from '@medplum/core';
import type { BotEvent, MedplumClient } from '@medplum/core';
import type { Bundle, Patient, Reference } from '@medplum/fhirtypes';
import { convertHealthieAllergyToFhir, fetchAllergySensitivities } from './healthie/allergy';
import { convertHealthieAppointmentToFhir, fetchAppointments } from './healthie/appointment';
import { HealthieClient } from './healthie/client';
import {
  HEALTHIE_ALLERGY_ID_SYSTEM,
  HEALTHIE_APPOINTMENT_ID_SYSTEM,
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
  appointmentFilter?: string;
  concurrency?: number;
  batchSize?: number;
}

interface PatientResult {
  patientId: string;
  success: boolean;
  resourceCount: number;
  durationMs: number;
  error?: string;
}

interface ProcessPatientContext {
  healthie: HealthieClient;
  medplum: MedplumClient;
  healthieApiUrl: string;
  appointmentFilter?: string;
}

export async function processPatient(
  healthiePatientId: string,
  ctx: ProcessPatientContext
): Promise<PatientResult> {
  const startTime = Date.now();
  try {
    const patientBundle: Bundle = {
      resourceType: 'Bundle',
      type: 'batch',
      entry: [],
    };

    const healthiePatient = (await fetchHealthiePatients(ctx.healthie, [healthiePatientId]))[0];
    if (!healthiePatient) {
      console.log(`Healthie patient ${healthiePatientId} not found`);
      return { patientId: healthiePatientId, success: true, resourceCount: 0, durationMs: Date.now() - startTime };
    }

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

    const [medications, allergies, questionnaireResponses, policies, documents, appointments] = await Promise.all([
      fetchMedications(ctx.healthie, healthiePatient.id),
      fetchAllergySensitivities(ctx.healthie, healthiePatient.id),
      fetchHealthieFormAnswerGroups(healthiePatient.id, ctx.healthie),
      fetchPolicies(ctx.healthie, healthiePatient.id),
      fetchDocuments(ctx.healthie, healthiePatient.id),
      fetchAppointments(ctx.healthie, healthiePatient.id, ctx.appointmentFilter),
    ]);
    console.log(
      `Patient ${healthiePatient.id}: ${medications.length} meds, ${allergies.length} allergies, ` +
        `${questionnaireResponses.length} forms, ${policies.length} policies, ${documents.length} docs, ${appointments.length} appts`
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
          ctx.healthieApiUrl,
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
      const needsDownload = await shouldDownloadDocument(doc, ctx.medplum);
      if (!needsDownload) {
        continue;
      }

      const documentReference = convertHealthieDocumentToFhir(doc, patientReference);

      if (doc.expiring_url) {
        const downloaded = await downloadDocumentContent(doc.expiring_url);
        if (downloaded) {
          try {
            const createdBinary = await ctx.medplum.createBinary({
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

    for (const appointment of appointments) {
      patientBundle.entry?.push({
        resource: convertHealthieAppointmentToFhir(appointment, patientReference),
        request: {
          method: 'PUT',
          url: `Appointment?identifier=${HEALTHIE_APPOINTMENT_ID_SYSTEM}|${appointment.id}`,
        },
      });
    }

    const resourceCount = patientBundle.entry?.length ?? 0;
    if (resourceCount > 0) {
      const result = await ctx.medplum.executeBatch(patientBundle);
      result.entry?.forEach((e, index) => {
        if (!e.response?.status.startsWith('2')) {
          console.log(JSON.stringify(e.response, null, 2));
          console.log(JSON.stringify(patientBundle.entry?.[index]?.request, null, 2));
        }
      });
      console.log(`Successfully synced patient ${healthiePatient.id} with ${resourceCount} resources`);
    } else {
      console.log(`No resources to sync for patient ${healthiePatient.id}`);
    }

    return { patientId: healthiePatientId, success: true, resourceCount, durationMs: Date.now() - startTime };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`Failed to sync patient ${healthiePatientId}:`, error);
    return { patientId: healthiePatientId, success: false, resourceCount: 0, durationMs: Date.now() - startTime, error: message };
  }
}

async function runWithConcurrency(
  patientIds: string[],
  concurrency: number,
  batchSize: number,
  processFn: (patientId: string) => Promise<PatientResult>
): Promise<PatientResult[]> {
  const results: PatientResult[] = [];
  const startTime = Date.now();
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < patientIds.length) {
      const index = nextIndex++;
      const result = await processFn(patientIds[index]);
      results.push(result);

      if (results.length % batchSize === 0) {
        const elapsed = (Date.now() - startTime) / 1000;
        const avgMs = elapsed * 1000 / results.length;
        console.log(`Progress: ${results.length}/${patientIds.length} patients (${elapsed.toFixed(1)}s elapsed, ${avgMs.toFixed(0)}ms avg/patient)`);
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, patientIds.length) }, () => worker());
  await Promise.all(workers);

  return results;
}

export async function handler(medplum: MedplumClient, event: BotEvent<ImportHealthiePatientsInput>): Promise<any> {
  const { HEALTHIE_API_URL, HEALTHIE_CLIENT_SECRET } = event.secrets;
  const { count, offset, patientIds, appointmentFilter, concurrency = 1, batchSize = 50 } = event.input;

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

  const ctx: ProcessPatientContext = {
    healthie,
    medplum,
    healthieApiUrl: HEALTHIE_API_URL.valueString,
    appointmentFilter,
  };

  const totalStartTime = Date.now();
  const results = await runWithConcurrency(
    healthiePatientIds,
    concurrency,
    batchSize,
    (id) => processPatient(id, ctx)
  );
  const totalDurationMs = Date.now() - totalStartTime;

  // Summary statistics
  const successful = results.filter((r) => r.success);
  const failed = results.filter((r) => !r.success);
  const totalResources = results.reduce((sum, r) => sum + r.resourceCount, 0);
  const patientsPerMin = results.length > 0 ? (results.length / (totalDurationMs / 60000)).toFixed(1) : '0';
  const avgMs = results.length > 0 ? Math.round(totalDurationMs / results.length) : 0;

  console.log(`\n--- Sync Summary ---`);
  console.log(`Total patients: ${results.length} (${successful.length} succeeded, ${failed.length} failed)`);
  console.log(`Total resources synced: ${totalResources}`);
  console.log(`Total time: ${(totalDurationMs / 1000).toFixed(1)}s | Avg: ${avgMs}ms/patient | Throughput: ${patientsPerMin} patients/min`);

  if (failed.length > 0) {
    console.log(`Failed patients:`);
    for (const f of failed) {
      console.log(`  - ${f.patientId}: ${f.error}`);
    }
  }

  console.log('Patient sync process completed');
}

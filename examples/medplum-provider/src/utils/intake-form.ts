// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MedplumClient, WithId } from '@medplum/core';
import { Patient, QuestionnaireResponse } from '@medplum/fhirtypes';

/**
 * Onboards a patient using questionnaire response data.
 *
 * This function uses the new QuestionnaireResponse/$extract operation (from Medplum PR #7412)
 * which automatically extracts FHIR resources from questionnaire responses using SDC IG extensions.
 * The questionnaire should contain template resources and extraction rules defined by the
 * Structured Data Capture Implementation Guide.
 *
 * @param medplum - The Medplum client
 * @param questionnaire - The questionnaire with extraction rules and template resources
 * @param response - The questionnaire response containing the patient data
 * @returns The created Patient resource
 */
export async function onboardPatient(medplum: MedplumClient, response: QuestionnaireResponse): Promise<Patient> {
  // Use the QuestionnaireResponse/$extract operation to automatically extract resources
  console.log('Using QuestionnaireResponse/$extract operation for automatic resource extraction');

  const questionnaireResponse: WithId<QuestionnaireResponse> = await medplum.createResource(response);

  const extractResult = await medplum.get(
    medplum.fhirUrl('QuestionnaireResponse', questionnaireResponse.id as string, '$extract')
  );

  // The extract operation returns a Bundle with the extracted resources
  const extractedBundle = extractResult as any;
  console.log('Extract operation result:', JSON.stringify(extractedBundle, null, 2));
  console.log('Extract operation entries:', extractedBundle.entry?.length || 0);

  if (extractedBundle.resourceType === 'Bundle' && extractedBundle.entry && extractedBundle.entry.length > 0) {
    console.log('Processing extracted resources from Bundle...');

    // Find the Patient resource from the extracted bundle
    const patientEntry = extractedBundle.entry.find((entry: any) => entry.resource?.resourceType === 'Patient');

    if (patientEntry?.resource) {
      console.log('Found Patient resource in extracted Bundle');

      // Execute the Bundle as a transaction to create all resources at once
      try {
        const transactionResult = await medplum.executeBatch(extractedBundle);
        console.log('Successfully executed Bundle transaction:', transactionResult);

        // Find the created Patient resource in the transaction result
        const createdPatientEntry = transactionResult.entry?.find(
          (entry: any) => entry.resource?.resourceType === 'Patient'
        );

        if (createdPatientEntry?.resource) {
          console.log('Successfully created Patient resource via Bundle transaction');
          return createdPatientEntry.resource as Patient;
        } else {
          console.warn('Patient resource not found in transaction result');
        }
      } catch (error) {
        console.error('Error executing Bundle transaction:', error);
        throw error;
      }
    } else {
      console.warn('No Patient resource found in extracted Bundle');
    }
  } else {
    console.warn('Extract operation returned empty Bundle - no resources to extract');
  }

  // If we get here, the extract operation didn't work as expected
  throw new Error(
    'QuestionnaireResponse/$extract operation did not return a valid Patient resource. Please ensure the questionnaire has proper SDC IG extensions configured.'
  );
}

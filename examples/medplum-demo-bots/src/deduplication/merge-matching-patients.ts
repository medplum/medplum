// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { BotEvent, MedplumClient, WithId } from '@medplum/core';
import {
  getQuestionnaireAnswers,
  getReferenceString,
  linkPatientRecords,
  mergePatientRecords,
  replaceReferences,
} from '@medplum/core';
import type {
  Bundle,
  Patient,
  QuestionnaireResponse,
  QuestionnaireResponseItemAnswer,
  Reference,
  RiskAssessment,
} from '@medplum/fhirtypes';

/**
 * Handler function to process incoming BotEvent containing a QuestionnaireResponse for potential patient record merges.
 *
 * Because this bot only considers a single (source, target) match, there is a risk of race conditions
 * across multiple merge operations. Managing race conditions over record merges is a known hard problem,
 * and n practice, this should be handled at the workflow level.
 *
 * There are a few different ways to handle such race conditions:
 *   - Modify the merge bot to operate on all RiskAssessments assigned to a given target patient
 *     rather than on each RiskAssessment individually. This would keep the merges sequential within the Bot.
 *   - Make sure all matches for a given target patient are reviewed by the same person.
 *     Have the reviewer-facing UI force the reviewer to handle all merges for a given target in sequence
 *
 * @param medplum - The Medplum client instance.
 * @param event - The BotEvent containing the QuestionnaireResponse.
 *
 */
export async function handler(medplum: MedplumClient, event: BotEvent<QuestionnaireResponse>): Promise<void> {
  // Extract answers from the QuestionnaireResponse.
  const responses = getQuestionnaireAnswers(event.input);
  // Get the reference to the RiskAssessment from the answers.
  const riskAssessmentReference = event.input.subject as QuestionnaireResponseItemAnswer;
  // If there's no valid RiskAssessment reference in the response, throw an error.
  if (!riskAssessmentReference) {
    throw new Error('Invalid input. Expected RiskAssessment reference');
  }
  const riskAssessment = (await medplum.readReference(riskAssessmentReference)) as RiskAssessment;
  const targetReference = riskAssessment.basis?.[0] as Reference<Patient>;
  const srcReference = riskAssessment.subject as Reference<Patient>;
  if (!targetReference || !srcReference) {
    throw new Error(
      `Undefined references target: ${JSON.stringify(targetReference, null, 2)} src: ${JSON.stringify(
        srcReference,
        null,
        2
      )}`
    );
  }

  // If merge is disabled based on the questionnaire's answer, terminate the handler early.
  // Reasons for disabling merge include:
  // - The patient records are not duplicates.
  // - The patient records are duplicates, but the user does not want to merge them.
  const mergeDisabled = responses['disableMerge']?.valueBoolean;
  if (mergeDisabled) {
    await addToDoNotMatchList(medplum, srcReference, targetReference);
    await addToDoNotMatchList(medplum, targetReference, srcReference);
    return;
  }

  // Read the source and target Patient resource
  const targetPatient = await medplum.readReference(targetReference);
  const sourcePatient = await medplum.readReference(srcReference);

  const patients = linkPatientRecords(sourcePatient, targetPatient);

  // Copy some data from the source patient to the target, depending on the user input
  let fieldUpdates = {} as Partial<Patient>;
  const appendName = responses['appendName']?.valueBoolean;
  const appendAddress = responses['appendAddress']?.valueBoolean;

  if (appendName) {
    fieldUpdates = { ...fieldUpdates, name: [...(targetPatient.name ?? []), ...(sourcePatient.name ?? [])] };
  }

  if (appendAddress) {
    fieldUpdates = { ...fieldUpdates, address: [...(targetPatient.address ?? []), ...(sourcePatient.address ?? [])] };
  }

  const mergedPatients = mergePatientRecords(patients.src, patients.target, fieldUpdates);

  // Update clinical data to point to the target resource
  // To improve efficiency, consider grouping these requests into a batch transaction (http://hl7.org/fhir/R4/http.html#transaction)
  await rewriteClinicalDataReferences(medplum, mergedPatients.src, mergedPatients.target);

  // We might delete the source patient record if we don't want to continue to have a duplicate of an existing patient
  // despite the fact that it is an inactive record.
  const deleteSource = responses['deleteSource']?.valueBoolean;
  if (deleteSource === true) {
    await medplum.deleteResource('Patient', mergedPatients.src.id as string);
  } else {
    // If we don't delete the source patient record, we need to update it to be inactive.
    await medplum.updateResource<Patient>(mergedPatients.src);
  }

  // Update the target patient record with the merged data, and have it as the master record.
  await medplum.updateResource<Patient>(mergedPatients.target);
}

// start-block updateReferences
/**
 * Rewrites all references to source patient to the target patient for all clinical data.
 * Uses the Patient $everything operation to efficiently retrieve all resources in the patient compartment.
 *
 * @param medplum - The MedplumClient
 * @param sourcePatient - Source `Patient` resource. After this operation, no resources will refer to this `Patient`
 * @param targetPatient - Target `Patient` resource. After this operation, all clinical resources will refer to this `Patient`
 */
export async function rewriteClinicalDataReferences(
  medplum: MedplumClient,
  sourcePatient: WithId<Patient>,
  targetPatient: WithId<Patient>
): Promise<void> {
  const sourceReference = getReferenceString(sourcePatient);
  const targetReference = getReferenceString(targetPatient);

  // Use readPatientEverything to efficiently retrieve all resources in the patient compartment
  // This operation supports pagination, so we need to follow 'next' links to get all resources
  let bundle: Bundle = await medplum.readPatientEverything(sourcePatient.id);

  // Process all pages of results
  while (bundle) {
    // Process all entries in the current bundle
    if (bundle.entry) {
      for (const entry of bundle.entry) {
        const resource = entry.resource;
        if (!resource) {
          continue;
        }

        // Skip the Patient resource itself (only if it matches the source patient ID)
        if (resource.resourceType === 'Patient' && resource.id === sourcePatient.id) {
          continue;
        }

        // Rewrite references from source to target
        replaceReferences(resource, sourceReference, targetReference);
        await medplum.updateResource(resource);
      }
    }

    // Check for next page
    const nextLink = bundle.link?.find((link) => link.relation === 'next');
    if (nextLink?.url) {
      // Fetch the next page
      bundle = await medplum.get<Bundle>(nextLink.url);
    } else {
      // No more pages
      break;
    }
  }
}

// Note: replaceReferences is imported from @medplum/core
// end-block updateReferences

// start-block doNotMatch
/**
 * Adds a patient to the 'doNotMatch' list for a given patient list.
 *
 * @param medplum - The Medplum client instance.
 * @param subject - Reference to the patient list.
 * @param patientAdded - Reference to the patient being added to the 'doNotMatch' list.
 *
 * @returns - Returns a promise that resolves when the operation is completed.
 */
async function addToDoNotMatchList(
  medplum: MedplumClient,
  subject: Reference<Patient>,
  patientAdded: Reference<Patient>
): Promise<void> {
  const list = await medplum.searchOne('List', {
    subject: subject.reference,
    code: 'http://example.org/listType|doNotMatch',
  });
  if (list) {
    const entries = list.entry ?? [];
    entries.push({ item: patientAdded });
    await medplum.updateResource({ ...list, entry: entries });
    return;
  }
  console.warn('No doNotMatch list found for patient: ' + subject.reference);
}
// end-block doNotMatch

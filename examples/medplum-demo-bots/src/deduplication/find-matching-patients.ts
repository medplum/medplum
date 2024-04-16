import { BotEvent, MedplumClient, createReference, getReferenceString, resolveId } from '@medplum/core';
import { Patient, RiskAssessment, Task } from '@medplum/fhirtypes';

/**
 * This Bot listens for changes to a `Patient` resource and searches for potential patient duplicates.
 * The matching algorithm used is to search for exact matches:
 *  - first name
 *  - last name
 *  - date of birth
 *  - postal code
 *
 * See: https://www.medplum.com/docs/fhir-datastore/patient-deduplication#matching-rules
 * for more potential matching rules
 *
 * @param medplum - The Medplum client instance.
 * @param event - The BotEvent containing the Patient resource.
 */
export async function handler(medplum: MedplumClient, event: BotEvent<Patient>): Promise<void> {
  //This bot should only be triggered by a Patient resource Subscription only
  const srcPatient = event.input;

  // Read the patient's "Do Not Match" list. Assume there is only one applicable list
  const doNotMatchList = await medplum.searchOne('List', {
    code: 'http://example.org/listType|doNotMatch',
    subject: getReferenceString(srcPatient),
  });

  console.info('Searching for matches for: ' + getReferenceString(srcPatient));

  // Search for potential active duplicate patients by matching first name, last name, birthdate, and postal code.
  const candidateMatches = await medplum.searchResources('Patient', {
    'family:exact': srcPatient.name?.[0]?.family,
    'given:exact': srcPatient.name?.[0]?.given?.join(' '),
    birthdate: srcPatient.birthDate,
    'address-postalcode': srcPatient.address?.[0]?.postalCode,
    // only search for patients that are 'active' (have not already been)
    active: true,
    // Exclude the source patient,
    '_id:not': srcPatient.id,
  });

  console.info(`Found ${candidateMatches.length} matches`);

  /* For each potentialMatch:
      - Check if it is on the "Do Not Match" list
      - If so, skip the match
      - Otherwise create a RiskAssessment resource that represents the candidate match
      - Create a Task for someone to review the match
  */
  for (const candidate of candidateMatches) {
    // Check if "Do Not Match" list contains the candidate match
    const blockedIds = doNotMatchList?.entry?.map((entry) => resolveId(entry.item)) ?? [];
    const shouldMatch = !blockedIds.some((blockedId) => blockedId === candidate.id);

    // If there are no lists marked with 'doNotMatch' for the potential duplicate patient, create a RiskAssessment and Task.
    if (shouldMatch) {
      // Create a RiskAssessment to represent the candidate match
      const riskAssessment = await medplum.createResource<RiskAssessment>({
        resourceType: 'RiskAssessment',
        subject: createReference(srcPatient),
        basis: [createReference(candidate)],
        status: 'final',
        code: {
          coding: [
            {
              system: 'http://example.org/riskAssessmentType',
              code: 'patientDuplicate',
            },
          ],
        },
        method: {
          coding: [
            {
              system: 'http://example.org/deduplicationMethod',
              code: 'name-dob-zip',
            },
          ],
        },
        prediction: [
          {
            probabilityDecimal: 90,
            qualitativeRisk: {
              text: 'Almost Certain',
            },
          },
        ],
      });

      // Create a Task for a human to review the match
      await medplum.createResource<Task>({
        resourceType: 'Task',
        code: {
          text: 'Review Potential Duplicate',
          coding: [
            {
              system: 'http://example.org/taskType',
              code: 'patientDuplicate',
            },
          ],
        },
        performerType: [
          // US SOC
          {
            text: 'Customer Service Representative',
            coding: [
              {
                code: '43-4050',
                system: 'https://www.bls.gov/soc',
              },
            ],
          },
        ],
        focus: createReference(riskAssessment),
        intent: 'proposal',
        status: 'requested',
      });
    }
  }
}

import { BotEvent, MedplumClient, createReference, getReferenceString, resolveId } from '@medplum/core';
import { Patient, RiskAssessment, Task } from '@medplum/fhirtypes';

/**
 * Handler function to process incoming BotEvent for potential patient duplicates.
 *
 * @param medplum - The Medplum client instance.
 * @param event - The BotEvent containing the Patient resource.
 */
export async function handler(medplum: MedplumClient, event: BotEvent): Promise<void> {
  //This bot should only be triggered by a Patient resource Subscription only
  const srcPatient = event.input as Patient;
  if (srcPatient.resourceType !== 'Patient') {
    throw new Error('Unexpected input. Expected Patient.');
  }
  // Search for potential duplicate patients by matching first name, last name, birthdate, and gender.
  const targetPatients = await medplum.searchResources(
    'Patient',
    'name=' +
      srcPatient.name?.[0].family +
      '&given=' +
      srcPatient.name?.[0].given +
      '&birthdate=' +
      srcPatient.birthDate +
      '&gender=' +
      srcPatient.gender
  );

  for (const target of targetPatients) {
    if (target.id === srcPatient.id) {
      return;
    }
    const lists = await medplum.searchResources('List', {
      code: 'doNotMatch',
      subject: getReferenceString(srcPatient),
    });
    // Filter lists to identify those marked with 'doNotMatch'.
    const filteredLists = lists.filter((list) => {
      const hasTargetId = list.entry?.filter((entry) => {
        if (resolveId(entry.item) === target.id) {
          return true;
        }
        return false;
      });
      return !!hasTargetId;
    });

    // If there are no lists marked with 'doNotMatch' for the potential duplicate patient, create a RiskAssessment and Task.
    if (filteredLists.length === 0) {
      const riskAssessment = await medplum.createResource<RiskAssessment>({
        resourceType: 'RiskAssessment',
        subject: createReference(srcPatient),
        basis: [createReference(target)],
        prediction: [
          {
            probabilityDecimal: 100,
            qualitativeRisk: {
              text: 'Certain',
            },
          },
        ],
      });

      await medplum.createResource<Task>({
        resourceType: 'Task',
        focus: createReference(riskAssessment),
      });
    }
  }
}

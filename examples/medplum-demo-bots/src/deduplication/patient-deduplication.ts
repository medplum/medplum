import { BotEvent, MedplumClient, createReference, getCodeBySystem } from '@medplum/core';
import { Patient, RiskAssessment, Task } from '@medplum/fhirtypes';

/**
 * Handler function to process incoming BotEvent for potential patient duplicates.
 */
export async function handler(medplum: MedplumClient, event: BotEvent): Promise<any> {
  //This bot should only be triggered by a Patient resource Subscription only
  const srcPatient = event.input as Patient;
  if (srcPatient.resourceType !== 'Patient') {
    throw new Error('Unexpected input. Expected Patient.');
  }
  console.log(event.input);
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
  console.log(targetPatients);
  targetPatients.forEach(async (target) => {
    const lists = await medplum.searchResources('List', { subject: createReference(srcPatient), code: 'doNotMatch' });

    // Filter lists to identify those marked with 'doNotMatch'.
    lists.filter((list) => {
      list.entry?.filter((entry) => {
        if (entry.item === createReference(target)) {
          return true;
        }
        return false;
      });
      return false;
    });
    // If there are no lists marked with 'doNotMatch' for the potential duplicate patient, create a RiskAssessment and Task.
    if (lists.length === 0) {
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
  });

  return true;
}

import { BotEvent, createReference, MedplumClient, RXNORM } from '@medplum/core';
import { Patient, QuestionnaireResponse, QuestionnaireResponseItem, Reference } from '@medplum/fhirtypes';

export async function handler(medplum: MedplumClient, event: BotEvent<QuestionnaireResponse>): Promise<any> {
  // Get all of the answers from the questionnaire response

  for (const item of event.input?.item?.[0]?.item as QuestionnaireResponseItem[]) {
    if (item.answer?.[0]?.valueBoolean) {
      const medication = await medplum.createResource({
        resourceType: 'MedicationStatement',
        subject: event.input.subject as Reference<Patient>,
        status: 'active',
        derivedFrom: [createReference(event.input as QuestionnaireResponse)],
        informationSource: event.input.subject as Reference<Patient>, // This indicates that the patient reported this medication
        medicationCodeableConcept: {
          coding: [
            {
              code: item.linkId,
              display: item.text,
              system: RXNORM,
            },
          ],
        },
      });
      console.log('Created medication: ', medication);
    }
  }

  return true;
}

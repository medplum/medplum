import { BotEvent, MedplumClient, SNOMED } from '@medplum/core';
import { Condition, Patient, QuestionnaireResponse, QuestionnaireResponseItem, Reference } from '@medplum/fhirtypes';

export async function handler(medplum: MedplumClient, event: BotEvent<QuestionnaireResponse>): Promise<any> {
  // Get all of the answers from the questionnaire response

  for (const item of event.input?.item?.[0]?.item as QuestionnaireResponseItem[]) {
    if (item.answer?.[0]?.valueBoolean) {
      const condition = await medplum.createResource<Condition>({
        resourceType: 'Condition',
        subject: event.input.subject as Reference<Patient>,
        encounter: event.input.encounter,
        extension: [
          {
            url: 'http://hl7.org/fhir/StructureDefinition/condition-assertedDate',
            valueDateTime: new Date().toISOString(),
          },
        ],
        clinicalStatus: {
          text: 'Active',
          coding: [
            {
              system: 'http://terminology.hl7.org/CodeSystem/condition-clinical',
              code: 'active',
              display: 'Active',
            },
          ],
        },
        verificationStatus: {
          coding: [
            {
              system: 'http://terminology.hl7.org/CodeSystem/condition-ver-status',
              code: 'confirmed',
              display: 'Confirmed',
            },
          ],
          text: 'Confirmed',
        },
        category: [
          {
            coding: [
              {
                system: 'http://terminology.hl7.org/CodeSystem/condition-category',
                code: 'problem-list-item',
                display: 'Problem List Item',
              },
            ],
            text: 'Problem List Item',
          },
        ],
        code: {
          coding: [
            {
              system: SNOMED,
              code: item.linkId,
              display: item.text,
            },
          ],
          text: item.text,
        },
        recordedDate: new Date().toISOString(),
        asserter: event.input.subject as Reference<Patient>,
      });
      console.log('Created condition: ', condition);
    }
  }

  return true;
}

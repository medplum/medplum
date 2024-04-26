import { Modal } from '@mantine/core';
import { getQuestionnaireAnswers } from '@medplum/core';
import { Questionnaire, QuestionnaireResponse } from '@medplum/fhirtypes';
import { QuestionnaireForm } from '@medplum/react';

interface CreateEncounterProps {
  readonly opened: boolean;
  readonly handlers: {
    readonly open: () => void;
    readonly close: () => void;
    readonly toggle: () => void;
  };
}

export function CreateEncounter({ opened, handlers }: CreateEncounterProps): JSX.Element {
  function handleQuestionnaireSubmit(formData: QuestionnaireResponse) {
    const answers = getQuestionnaireAnswers(formData);
    console.log(answers);
  }

  return (
    <Modal opened={opened} onClose={handlers.close}>
      <p>Create an Encounter</p>
      <QuestionnaireForm questionnaire={createEncounterQuestionnaire} onSubmit={handleQuestionnaireSubmit} />
    </Modal>
  );
}

const createEncounterQuestionnaire: Questionnaire = {
  resourceType: 'Questionnaire',
  status: 'active',
  title: 'Create an Encounter',
  id: 'new-encounter',
  item: [
    {
      linkId: 'patient',
      type: 'reference',
      text: 'What patient is the subject of this encounter?',
      required: true,
      extension: [
        {
          url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-referenceResource',
          valueCodeableConcept: {
            coding: [
              {
                code: 'Patient',
              },
            ],
          },
        },
      ],
    },
    {
      linkId: 'class',
      type: 'choice',
      text: 'What is the encounter class?',
      required: true,
      answerValueSet: 'http://terminology.hl7.org/ValueSet/v3-ActEncounterCode',
    },
    {
      linkId: 'type',
      type: 'choice',
      text: 'What type of encounter is this?',
      answerValueSet: 'http://hl7.org/fhir/ValueSet/encounter-type',
    },
    {
      linkId: 'date',
      type: 'date',
      text: 'What is the date of the encounter?',
      initial: [
        {
          valueDate: new Date().toISOString(),
        },
      ],
    },
  ],
};

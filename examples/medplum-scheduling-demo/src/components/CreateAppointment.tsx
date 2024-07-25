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

export function CreateAppointment(props: CreateEncounterProps): JSX.Element {
  const { opened, handlers } = props;

  function handleQuestionnaireSubmit(formData: QuestionnaireResponse): void {
    const answers = getQuestionnaireAnswers(formData);
    handlers.close();
  }

  return (
    <Modal opened={opened} onClose={handlers.close}>
      <p>Create an Appointment</p>
      <QuestionnaireForm questionnaire={appointmentQuestionnaire} onSubmit={handleQuestionnaireSubmit} />
    </Modal>
  );
}

const appointmentQuestionnaire: Questionnaire = {
  resourceType: 'Questionnaire',
  status: 'active',
  title: 'Create an Appointment',
  id: 'new-appointment',
  item: [
    {
      linkId: 'patient',
      type: 'reference',
      text: 'Which patient is the subject of this encounter?',
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
      linkId: 'start-date',
      type: 'dateTime',
      text: 'Start date',
      required: true,
    },
    {
      linkId: 'end-date',
      type: 'dateTime',
      text: 'End date',
      required: true,
    },
    {
      linkId: 'service-type',
      type: 'choice',
      text: 'What is the appointment service type?',
      answerValueSet: 'http://hl7.org/fhir/ValueSet/service-type',
      required: true,
    },
  ],
};

import { Modal } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { createReference, getQuestionnaireAnswers, normalizeErrorString } from '@medplum/core';
import {
  Appointment,
  Coding,
  Encounter,
  Patient,
  Practitioner,
  Questionnaire,
  QuestionnaireResponse,
} from '@medplum/fhirtypes';
import { QuestionnaireForm, useMedplum, useMedplumProfile } from '@medplum/react';
import { IconCircleCheck, IconCircleOff } from '@tabler/icons-react';
import { useNavigate } from 'react-router-dom';

interface CreateEncounterProps {
  appointment: Appointment;
  patient: Patient;
  readonly opened: boolean;
  readonly handlers: {
    readonly open: () => void;
    readonly close: () => void;
    readonly toggle: () => void;
  };
}

export function CreateEncounter(props: CreateEncounterProps): JSX.Element {
  const { appointment, patient, opened, handlers } = props;
  const medplum = useMedplum();
  const profile = useMedplumProfile() as Practitioner;
  const navigate = useNavigate();

  async function handleQuestionnaireSubmit(formData: QuestionnaireResponse): Promise<void> {
    const answers = getQuestionnaireAnswers(formData);
    const startDateTime = answers['start-date'].valueDateTime as string;
    const endDateTime = answers['end-date'].valueDateTime as string;
    const encounterClass = answers['class'].valueCoding as Coding;

    const encounterData: Encounter = {
      resourceType: 'Encounter',
      status: 'finished',
      appointment: [createReference(appointment)],
      class: encounterClass,
      serviceType: appointment.serviceType?.[0],
      period: {
        start: startDateTime,
        end: endDateTime,
      },
      subject: createReference(patient),
      participant: [
        {
          // Uses the logged user as the attender
          individual: createReference(profile),
          type: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v3-ParticipationType', code: 'ATND' }] }],
        },
      ],
    };

    try {
      await medplum.createResource(encounterData);

      navigate(`/Appointment/${appointment.id}/encounters`);
      showNotification({
        icon: <IconCircleCheck />,
        title: 'Success',
        message: 'Encounter created',
      });
      handlers.close();
    } catch (err) {
      showNotification({
        icon: <IconCircleOff />,
        title: 'Error',
        message: normalizeErrorString(err),
      });
    }

    handlers.close();
  }

  return (
    <Modal opened={opened} onClose={handlers.close}>
      <p>Create encounter</p>
      <QuestionnaireForm questionnaire={encounterQuestionnaire} onSubmit={handleQuestionnaireSubmit} />
    </Modal>
  );
}

const encounterQuestionnaire: Questionnaire = {
  resourceType: 'Questionnaire',
  status: 'active',
  title: 'Create an Encounter',
  id: 'new-encounter',
  item: [
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
      linkId: 'class',
      type: 'choice',
      text: 'Encounter class?',
      required: true,
      answerValueSet: 'http://terminology.hl7.org/ValueSet/v3-ActEncounterCode',
    },
  ],
};

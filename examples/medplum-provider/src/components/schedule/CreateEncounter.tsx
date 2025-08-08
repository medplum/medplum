// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Modal } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { createReference, getQuestionnaireAnswers, normalizeErrorString } from '@medplum/core';
import { Appointment, Coding, Encounter, Patient, Practitioner, Questionnaire, Reference } from '@medplum/fhirtypes';
import { QuestionnaireForm, useMedplum } from '@medplum/react';
import { IconCircleCheck, IconCircleOff } from '@tabler/icons-react';
import { JSX } from 'react';
import { useNavigate } from 'react-router';

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
  const navigate = useNavigate();

  async function handleCreateEncounter(formData: any): Promise<void> {
    const answers = getQuestionnaireAnswers(formData);

    try {
      // Update the appointment status to 'fulfilled'
      await medplum.updateResource({
        ...appointment,
        status: 'fulfilled',
      });

      // Create the Encounter resource
      const patientReference = createReference(patient);
      const participant = appointment.participant?.filter((p) => p.actor?.reference !== patientReference.reference);
      const duration = new Date(appointment.end as string).getTime() - new Date(appointment.start as string).getTime();
      let encounter: Encounter = {
        resourceType: 'Encounter',
        status: 'finished',
        subject: patientReference,
        appointment: [createReference(appointment)],
        class: {
          system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
          code: 'VR',
          display: 'virtual',
        },
        type: [{ coding: [answers['type'].valueCoding as Coding] }],
        serviceType: appointment.serviceType?.[0],
        period: {
          start: appointment.start,
          end: appointment.end,
        },
        length: {
          value: Math.floor(duration / 60000),
          unit: 'minutes',
        },
        participant: participant.map((p) => ({
          individual: p.actor as Reference<Practitioner>,
          type: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v3-ParticipationType', code: 'ATND' }] }],
        })),
      };
      encounter = await medplum.createResource(encounter);

      // Navigate to the encounter details page
      navigate(`/Encounter/${encounter.id}`)?.catch(console.error);
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
  }

  return (
    <Modal opened={opened} onClose={handlers.close}>
      <QuestionnaireForm questionnaire={createEncounterQuestionnaire} onSubmit={handleCreateEncounter} />
    </Modal>
  );
}

const createEncounterQuestionnaire: Questionnaire = {
  resourceType: 'Questionnaire',
  id: 'new-encounter',
  title: 'Create Encounter',
  status: 'active',
  item: [
    {
      linkId: 'info-note',
      type: 'display',
      text:
        "By submitting the form, the appointment status will be set to 'fulfilled' and " +
        'an Encounter resource will be created to capture details about the visit. ' +
        'To further explore the Encounter lifecycle, please visit the Medplum Charting Demo.',
    },
    {
      linkId: 'type',
      type: 'choice',
      text: 'Type',
      answerValueSet: 'http://hl7.org/fhir/ValueSet/encounter-type',
      required: true,
    },
  ],
};

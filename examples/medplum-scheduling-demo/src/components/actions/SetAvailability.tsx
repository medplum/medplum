// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Modal } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { createReference, getAllQuestionnaireAnswers, normalizeErrorString } from '@medplum/core';
import {
  Coding,
  Questionnaire,
  QuestionnaireItemAnswerOption,
  QuestionnaireResponse,
  Schedule,
} from '@medplum/fhirtypes';
import { Loading, QuestionnaireForm, useMedplum } from '@medplum/react';
import { IconCircleCheck, IconCircleOff } from '@tabler/icons-react';
import { JSX, useContext } from 'react';
import { SetAvailabilityEvent } from '../../bots/core/set-availability';
import { ScheduleContext } from '../../Schedule.context';

interface SetAvailabilityProps {
  readonly opened: boolean;
  readonly handlers: {
    readonly open: () => void;
    readonly close: () => void;
    readonly toggle: () => void;
  };
}

export function SetAvailability(props: SetAvailabilityProps): JSX.Element {
  const { opened, handlers } = props;

  const medplum = useMedplum();

  const { schedule } = useContext(ScheduleContext);

  if (!schedule) {
    return <Loading />;
  }

  async function handleQuestionnaireSubmit(formData: QuestionnaireResponse): Promise<void> {
    const answers = getAllQuestionnaireAnswers(formData);

    try {
      // Call 'set-availability' bot to create slots
      const input: SetAvailabilityEvent = {
        schedule: createReference(schedule as Schedule),
        startDate: answers['start-date'][0].valueDate as string,
        endDate: answers['end-date'][0].valueDate as string,
        startTime: answers['start-time'][0].valueTime as string,
        endTime: answers['end-time'][0].valueTime as string,
        duration: answers['duration'][0].valueInteger as number,
        daysOfWeek: answers['days-of-week'].map(
          (d: QuestionnaireItemAnswerOption) => (d.valueCoding as Coding).code as string
        ),
        timezoneOffset: new Date().getTimezoneOffset(),
      };
      await medplum.executeBot({ system: 'http://example.com', value: 'set-availability' }, input);

      showNotification({
        icon: <IconCircleCheck />,
        title: 'Success',
        message: 'Slots created',
      });
    } catch (err) {
      showNotification({
        color: 'red',
        icon: <IconCircleOff />,
        title: 'Error',
        message: normalizeErrorString(err),
      });
    }

    handlers.close();
  }

  return (
    <Modal opened={opened} onClose={handlers.close}>
      <QuestionnaireForm
        questionnaire={setAvailabilityQuestionnaire}
        subject={createReference(schedule)}
        onSubmit={handleQuestionnaireSubmit}
      />
    </Modal>
  );
}

const setAvailabilityQuestionnaire: Questionnaire = {
  resourceType: 'Questionnaire',
  status: 'active',
  title: 'Set Availability',
  id: 'set-availability',
  item: [
    {
      linkId: 'start-date',
      type: 'date',
      text: 'Start date',
      required: true,
      initial: [{ valueDate: new Date().toISOString().slice(0, 10) }],
    },
    {
      linkId: 'end-date',
      type: 'date',
      text: 'End date',
      required: true,
    },
    {
      linkId: 'start-time',
      type: 'time',
      text: 'Start time (each day)',
      required: true,
      initial: [{ valueTime: '09:00:00' }],
    },
    {
      linkId: 'end-time',
      type: 'time',
      text: 'End time (each day)',
      required: true,
      initial: [{ valueTime: '17:00:00' }],
    },
    {
      linkId: 'duration',
      type: 'integer',
      text: 'Duration of each slot (minutes)',
      required: true,
      initial: [{ valueInteger: 60 }],
    },
    {
      linkId: 'days-of-week',
      type: 'choice',
      text: 'Days of Week',
      required: true,
      repeats: true,
      answerOption: [
        { valueCoding: { code: 'sun', display: 'Sunday', system: 'http://hl7.org/fhir/days-of-week' } },
        { valueCoding: { code: 'mon', display: 'Monday', system: 'http://hl7.org/fhir/days-of-week' } },
        { valueCoding: { code: 'tue', display: 'Tuesday', system: 'http://hl7.org/fhir/days-of-week' } },
        { valueCoding: { code: 'wed', display: 'Wednesday', system: 'http://hl7.org/fhir/days-of-week' } },
        { valueCoding: { code: 'thu', display: 'Thursday', system: 'http://hl7.org/fhir/days-of-week' } },
        { valueCoding: { code: 'fri', display: 'Friday', system: 'http://hl7.org/fhir/days-of-week' } },
        { valueCoding: { code: 'sat', display: 'Saturday', system: 'http://hl7.org/fhir/days-of-week' } },
      ],
      extension: [
        {
          url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-itemControl',
          valueCodeableConcept: {
            coding: [
              {
                system: 'http://hl7.org/fhir/questionnaire-item-control',
                code: 'drop-down',
                display: 'Drop down',
              },
            ],
            text: 'Drop down',
          },
        },
      ],
    },
  ],
};

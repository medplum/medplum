// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Code, ScrollArea, Title, Text, Stack } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { normalizeErrorString } from '@medplum/core';
import type { Questionnaire, QuestionnaireResponse } from '@medplum/fhirtypes';
import { AIRealTimeQuestionnaireForm, Document, useMedplum, useMedplumProfile } from '@medplum/react';
import type { JSX } from 'react';
import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router';
import { onboardPatient } from '../../utils/intake-form';

export function AudioIntakeFormPage(): JSX.Element {
  const navigate = useNavigate();
  const medplum = useMedplum();
  const profile = useMedplumProfile();
  const [transcript, setTranscript] = useState('');

  const handleOnSubmit = useCallback(
    async (response: QuestionnaireResponse) => {
      if (!profile) {
        return;
      }
      try {
        const patient = await onboardPatient(medplum, simpleIntakeQuestionnaire, response);
        navigate(`/Patient/${patient.id}/timeline`)?.catch(console.error);
      } catch (error) {
        showNotification({
          color: 'red',
          message: normalizeErrorString(error),
          autoClose: false,
        });
      }
    },
    [medplum, navigate, profile]
  );

  return (
    <Document width={800}>
      <Stack gap="md" mb="xl">
        <Title order={2}>Voice-Enabled Patient Intake Demo</Title>
        <Alert color="blue" title="How to use">
          <Text size="sm">
            Click the microphone button to start recording your answers. Speak naturally to fill out the form. For
            example, you can say:
          </Text>
          <ul style={{ marginTop: '8px', marginBottom: '8px' }}>
            <li>"My name is Sarah Johnson and I'm 28 years old"</li>
            <li>"I live at 123 Main Street in Boston Massachusetts"</li>
            <li>"I have allergies to penicillin and peanuts"</li>
            <li>"I'm currently taking metformin for diabetes"</li>
          </ul>
          <Text size="sm">
            The AI will automatically map your spoken answers to the appropriate form fields. You can continue speaking
            to add or update answers.
          </Text>
        </Alert>
      </Stack>

      <AIRealTimeQuestionnaireForm
        questionnaire={simpleIntakeQuestionnaire}
        onSubmit={handleOnSubmit}
        onTranscript={(full) => setTranscript(full)}
      />

      <Stack gap="xs" mt="xl">
        <Title order={5}>Debug: Realtime Transcript</Title>
        <ScrollArea h={160} type="auto">
          <Code block style={{ whiteSpace: 'pre-wrap', minHeight: 120 }}>
            {transcript || '(no transcript yet — press the mic and speak)'}
          </Code>
        </ScrollArea>
      </Stack>
    </Document>
  );
}

/**
 * Simplified intake questionnaire for audio demo
 * Focuses on common fields that are easy to answer via voice
 */
const simpleIntakeQuestionnaire: Questionnaire = {
  resourceType: 'Questionnaire',
  status: 'active',
  title: 'Patient Intake Questionnaire (Voice-Enabled Demo)',
  url: 'https://medplum.com/Questionnaire/audio-patient-intake-demo',
  name: 'audio-patient-intake-demo',
  item: [
    {
      linkId: 'patient-demographics',
      text: 'Demographics',
      type: 'group',
      item: [
        {
          linkId: 'first-name',
          text: 'First Name',
          type: 'string',
          required: true,
        },
        {
          linkId: 'last-name',
          text: 'Last Name',
          type: 'string',
          required: true,
        },
        {
          linkId: 'dob',
          text: 'Date of Birth',
          type: 'date',
        },
        {
          linkId: 'phone',
          text: 'Phone Number',
          type: 'string',
        },
        {
          linkId: 'street',
          text: 'Street Address',
          type: 'string',
        },
        {
          linkId: 'city',
          text: 'City',
          type: 'string',
        },
        {
          linkId: 'state',
          text: 'State',
          type: 'string',
        },
        {
          linkId: 'zip',
          text: 'Zip Code',
          type: 'string',
        },
      ],
    },
    {
      linkId: 'medical-info',
      text: 'Medical Information',
      type: 'group',
      item: [
        {
          linkId: 'has-allergies',
          text: 'Do you have any allergies?',
          type: 'boolean',
        },
        {
          linkId: 'allergies-list',
          text: 'Please list your allergies',
          type: 'string',
          enableWhen: [
            {
              question: 'has-allergies',
              operator: '=',
              answerBoolean: true,
            },
          ],
        },
        {
          linkId: 'current-medications',
          text: 'Are you currently taking any medications?',
          type: 'boolean',
        },
        {
          linkId: 'medications-list',
          text: 'Please list your current medications',
          type: 'string',
          enableWhen: [
            {
              question: 'current-medications',
              operator: '=',
              answerBoolean: true,
            },
          ],
        },
        {
          linkId: 'medical-conditions',
          text: 'Do you have any chronic medical conditions?',
          type: 'boolean',
        },
        {
          linkId: 'conditions-list',
          text: 'Please describe your medical conditions',
          type: 'string',
          enableWhen: [
            {
              question: 'medical-conditions',
              operator: '=',
              answerBoolean: true,
            },
          ],
        },
      ],
    },
    {
      linkId: 'emergency-contact',
      text: 'Emergency Contact',
      type: 'group',
      item: [
        {
          linkId: 'emergency-contact-name',
          text: 'Emergency Contact Name',
          type: 'string',
        },
        {
          linkId: 'emergency-contact-phone',
          text: 'Emergency Contact Phone',
          type: 'string',
        },
        {
          linkId: 'emergency-contact-relationship',
          text: 'Relationship to Patient',
          type: 'string',
        },
      ],
    },
  ],
};

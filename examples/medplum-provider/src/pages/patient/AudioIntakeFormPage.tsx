// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { showNotification } from '@mantine/notifications';
import { normalizeErrorString } from '@medplum/core';
import type { Questionnaire, QuestionnaireResponse } from '@medplum/fhirtypes';
import { AIRealTimeQuestionnaireForm, Document, useMedplum, useMedplumProfile } from '@medplum/react';
import type { JSX } from 'react';
import { useCallback } from 'react';
import { useNavigate } from 'react-router';
import { onboardPatient } from '../../utils/intake-form';


const voiceInstructions = (
  <ul>
    <li>
      To fill out the form, just speak naturally and the dictation tool will automatically map your spoken answers to
      the appropriate form fields.
    </li>
    <li>
      Pause briefly between thoughts to allow the tool to process and fill in the fields. You can continue speaking to
      add or update answers.
    </li>
    <li>
      Try saying something like: “My name is Sarah Johnson and I'm 28 years old” or “I live at 123 Main Street in Boston
      Massachusetts”
    </li>
  </ul>
);

export function AudioIntakeFormPage(): JSX.Element {
  const navigate = useNavigate();
  const medplum = useMedplum();
  const profile = useMedplumProfile();

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
      <AIRealTimeQuestionnaireForm
        questionnaire={simpleIntakeQuestionnaire}
        onSubmit={handleOnSubmit}
        voiceInstructions={voiceInstructions}
      />
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

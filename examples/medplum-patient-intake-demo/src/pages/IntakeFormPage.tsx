// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { showNotification } from '@mantine/notifications';
import { createReference, normalizeErrorString } from '@medplum/core';
import { Bundle, QuestionnaireResponse } from '@medplum/fhirtypes';
import { Document, QuestionnaireForm, useMedplum, useMedplumProfile } from '@medplum/react';
import { IconCircleCheck, IconCircleOff } from '@tabler/icons-react';
import { JSX, useCallback, useContext } from 'react';
import { useNavigate } from 'react-router';
import { Loading } from '../components/Loading';
import { IntakeQuestionnaireContext } from '../Questionnaire.context';

export function IntakeFormPage(): JSX.Element {
  const navigate = useNavigate();
  const medplum = useMedplum();
  const profile = useMedplumProfile();
  const { questionnaire } = useContext(IntakeQuestionnaireContext);

  const handleOnSubmit = useCallback(
    async (response: QuestionnaireResponse) => {
      if (!questionnaire || !profile) {
        return;
      }

      try {
        const created = await medplum.createResource<QuestionnaireResponse>({
          ...response,
          author: createReference(profile),
        });

        const extractUrl = medplum.fhirUrl('QuestionnaireResponse', created.id as string, '$extract');
        const extractResult = await medplum.get(extractUrl) as Bundle;
        if (extractResult) {
          await medplum.executeBatch(extractResult);
        }

        showNotification({
          icon: <IconCircleCheck />,
          title: 'Success',
          message: 'Answers recorded',
        });

        await navigate('/Patient');
        window.scrollTo(0, 0);
      } catch (err) {
        showNotification({
          color: 'red',
          icon: <IconCircleOff />,
          title: 'Error',
          message: normalizeErrorString(err),
        });
      }
    },
    [medplum, navigate, questionnaire, profile]
  );

  if (!questionnaire) {
    return <Loading />;
  }
  return (
    <Document width={800}>
      <QuestionnaireForm questionnaire={questionnaire} onSubmit={handleOnSubmit} />
    </Document>
  );
}
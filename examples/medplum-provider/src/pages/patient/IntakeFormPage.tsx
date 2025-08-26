// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { showNotification } from '@mantine/notifications';
import { ContentType, normalizeErrorString } from '@medplum/core';
import { Questionnaire, QuestionnaireResponse } from '@medplum/fhirtypes';
import { Document, Loading, QuestionnaireForm, useMedplum, useMedplumProfile } from '@medplum/react';
import { JSX, useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { C1_PATIENT_INTAKE_BOT_IDENTIFIER, MEDPLUM_BOTS, PATIENT_INTAKE_QUESTIONNAIRE_IDENTIFIER } from '@/constants';
import { showErrorNotification } from '@/utils/notifications';

export function IntakeFormPage(): JSX.Element {
  const navigate = useNavigate();
  const medplum = useMedplum();
  const profile = useMedplumProfile();
  const [questionnaire, setQuestionnaire] = useState<Questionnaire | undefined>(undefined);

  useEffect(() => {
    async function loadQuestionnaire(): Promise<void> {
      const questionnaire = await medplum.searchOne('Questionnaire', {
        identifier: PATIENT_INTAKE_QUESTIONNAIRE_IDENTIFIER,
      });
      setQuestionnaire(questionnaire);
    }
    loadQuestionnaire().catch((err) => showErrorNotification(err));
  }, [medplum]);

  const handleOnSubmit = useCallback(
    async (response: QuestionnaireResponse) => {
      if (!questionnaire || !profile) {
        return;
      }
      try {
        const patient = await medplum.executeBot(
          {
            system: MEDPLUM_BOTS,
            value: C1_PATIENT_INTAKE_BOT_IDENTIFIER,
          },
          response,
          ContentType.FHIR_JSON
        );
        navigate(`/Patient/${patient.id}/timeline`)?.catch(console.error);
      } catch (error) {
        showNotification({
          color: 'red',
          message: normalizeErrorString(error),
          autoClose: false,
        });
      }
    },
    [medplum, navigate, profile, questionnaire]
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

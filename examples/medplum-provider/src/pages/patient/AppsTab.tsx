// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { getReferenceString } from '@medplum/core';
import type { Questionnaire, QuestionnaireResponse } from '@medplum/fhirtypes';
import { Document, Loading, QuestionnaireForm, useMedplum, useResource } from '@medplum/react';
import type { JSX } from 'react';
import { useCallback } from 'react';
import { useNavigate, useParams } from 'react-router';
import { usePatient } from '../../hooks/usePatient';

export function AppsTab(): JSX.Element {
  const { questionnaireId } = useParams();
  const medplum = useMedplum();
  const navigate = useNavigate();
  const patient = usePatient();
  const questionnaire = useResource<Questionnaire>({ reference: `Questionnaire/${questionnaireId}` });

  const handleSubmit = useCallback(
    async (response: QuestionnaireResponse) => {
      if (!patient?.id) {
        return;
      }
      try {
        await medplum.createResource({
          ...response,
          subject: { reference: getReferenceString(patient) },
        });
        navigate(`/Patient/${patient.id}/timeline`)?.catch(console.error);
      } catch (error) {
        console.error('Failed to submit questionnaire response:', error);
      }
    },
    [medplum, navigate, patient]
  );

  // Show loading if questionnaire hasn't loaded or if we're still loading a different questionnaire
  if (!questionnaire || !patient || questionnaire.id !== questionnaireId) {
    return <Loading />;
  }

  return (
    <Document key={questionnaireId}>
      <QuestionnaireForm
        questionnaire={questionnaire}
        subject={{ reference: getReferenceString(patient) }}
        onSubmit={handleSubmit}
      />
    </Document>
  );
}

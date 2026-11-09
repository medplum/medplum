// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
// start-block pageImports
import { normalizeErrorString } from '@medplum/core';
import type { Questionnaire, QuestionnaireResponse } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import type { JSX } from 'react';
import { useEffect, useState } from 'react';
import { SavedQuestionnaireForm } from './saved-questionnaire-form';
import { loadActivityForm, validateActivityResponse } from './saving-responses';
// end-block pageImports

// start-block assignedPage
export function ActivityFormPage(props: {
  questionnaireId: string;
  patientId: string;
  assignmentId: string;
}): JSX.Element {
  const medplum = useMedplum();
  const { questionnaireId, patientId, assignmentId } = props;
  const requestKey = JSON.stringify([questionnaireId, patientId, assignmentId]);
  const [loaded, setLoaded] = useState<{
    key: string;
    questionnaire?: Questionnaire;
    response?: QuestionnaireResponse;
    error?: string;
  }>();

  useEffect(() => {
    let active = true;
    loadActivityForm(medplum, questionnaireId, patientId, assignmentId)
      .then((result) => {
        if (active) {
          setLoaded({ key: requestKey, ...result });
        }
      })
      .catch((err) => {
        if (active) {
          setLoaded({ key: requestKey, error: normalizeErrorString(err) });
        }
      });
    return () => {
      active = false;
    };
  }, [medplum, questionnaireId, patientId, assignmentId, requestKey]);

  if (loaded?.key === requestKey && loaded.error) {
    return <p role="alert">Unable to load the form: {loaded.error}</p>;
  }
  if (loaded?.key !== requestKey || !loaded.questionnaire || !loaded.response) {
    return <p role="status">Loading form...</p>;
  }
  return (
    <SavedQuestionnaireForm
      key={loaded.response.id}
      questionnaire={loaded.questionnaire}
      response={loaded.response}
      validateResponse={validateActivityResponse}
    />
  );
}
// end-block assignedPage

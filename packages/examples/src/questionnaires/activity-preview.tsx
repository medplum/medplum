// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
// start-block preview
import type { QuestionnaireResponse } from '@medplum/fhirtypes';
import { QuestionnaireForm } from '@medplum/react';
import type { JSX } from 'react';
import { useState } from 'react';
import { activityQuestionnaire } from './advanced-questionnaires';

export function ActivityPreview(): JSX.Element {
  const [response, setResponse] = useState<QuestionnaireResponse>();
  return (
    <>
      <QuestionnaireForm questionnaire={activityQuestionnaire} onChange={setResponse} onSubmit={setResponse} />
      <details>
        <summary>Current response</summary>
        <pre>{JSON.stringify(response, undefined, 2)}</pre>
      </details>
    </>
  );
}
// end-block preview

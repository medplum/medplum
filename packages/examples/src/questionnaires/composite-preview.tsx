// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
// start-block preview
import type { QuestionnaireResponse } from '@medplum/fhirtypes';
import { QuestionnaireForm } from '@medplum/react';
import type { JSX } from 'react';
import { useState } from 'react';
import { buildVisitPreparation } from './modular-questionnaires';

export function CompositePreview(): JSX.Element {
  const [questionnaire] = useState(buildVisitPreparation);
  const [response, setResponse] = useState<QuestionnaireResponse>();
  return (
    <>
      <QuestionnaireForm questionnaire={questionnaire} onSubmit={setResponse} />
      <details>
        <summary>Submitted response</summary>
        <pre>{JSON.stringify(response, undefined, 2)}</pre>
      </details>
    </>
  );
}
// end-block preview

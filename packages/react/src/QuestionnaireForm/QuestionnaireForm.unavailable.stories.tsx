// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { badRequest, OperationOutcomeError } from '@medplum/core';
import type { Extension } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import type { Meta } from '@storybook/react';
import type { JSX } from 'react';
import { Document } from '../Document/Document';
import { QuestionnaireForm } from './QuestionnaireForm';

export default {
  title: 'Medplum/QuestionnaireForm',
  component: QuestionnaireForm,
} as Meta;

// A client whose expand rejects for any URL containing "missing" (a permanent 400)
function makeClient(): MockClient {
  const medplum = new MockClient();
  const originalExpand = medplum.valueSetExpand.bind(medplum);
  medplum.valueSetExpand = (async (
    params: Parameters<typeof originalExpand>[0],
    options?: Parameters<typeof originalExpand>[1]
  ) => {
    if (params.url?.includes('missing')) {
      throw new OperationOutcomeError(badRequest(`ValueSet ${params.url} not found`));
    }
    return originalExpand(params, options);
  }) as typeof medplum.valueSetExpand;
  return medplum;
}

const MISSING = 'http://example.com/missing';

function itemControl(code: string): Extension[] {
  return [
    {
      url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-itemControl',
      valueCodeableConcept: { coding: [{ system: 'http://hl7.org/fhir/questionnaire-item-control', code }] },
    },
  ];
}

export const MissingValueSet = (): JSX.Element => (
  <MedplumProvider medplum={makeClient()}>
    <Document>
      <QuestionnaireForm
        questionnaire={{
          resourceType: 'Questionnaire',
          status: 'active',
          title: 'Missing value set',
          item: [
            {
              linkId: 'radio',
              text: 'Radio buttons',
              type: 'choice',
              answerValueSet: MISSING,
              extension: itemControl('radio-button'),
            },
            {
              linkId: 'checkbox',
              text: 'Checkboxes',
              type: 'choice',
              answerValueSet: MISSING,
              extension: itemControl('check-box'),
            },
            {
              linkId: 'dropdown',
              text: 'Drop down (accepts free text)',
              type: 'choice',
              answerValueSet: MISSING,
              extension: itemControl('drop-down'),
            },
          ],
        }}
        onSubmit={console.log}
      />
    </Document>
  </MedplumProvider>
);

// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { ConceptMap } from '@medplum/fhirtypes';
import type { Meta } from '@storybook/react';
import type { JSX } from 'react';
import { Document } from '../Document/Document';
import { ConceptMapBuilder } from './ConceptMapBuilder';

export default {
  title: 'Medplum/ConceptMapBuilder',
  component: ConceptMapBuilder,
} as Meta;

const SNOMED = 'http://snomed.info/sct';
const ICD10 = 'http://hl7.org/fhir/sid/icd-10-cm';
const CPT = 'http://www.ama-assn.org/go/cpt';

const singleGroupExample: ConceptMap = {
  resourceType: 'ConceptMap',
  status: 'draft',
  name: 'SnomedToIcd10',
  group: [
    {
      source: SNOMED,
      target: ICD10,
      element: [
        {
          code: '73211009',
          display: 'Diabetes mellitus',
          target: [{ code: 'E11.9', display: 'Type 2 diabetes mellitus without complications', equivalence: 'equivalent' }],
        },
        {
          code: '386661006',
          display: 'Fever',
          target: [{ code: 'R50.9', display: 'Fever, unspecified', equivalence: 'narrower' }],
        },
        {
          code: '49436004',
          display: 'Atrial fibrillation',
          target: [{ equivalence: 'unmatched' }],
        },
      ],
    },
  ],
};

const multiGroupExample: ConceptMap = {
  resourceType: 'ConceptMap',
  status: 'draft',
  name: 'SnomedCrosswalks',
  group: [
    {
      source: SNOMED,
      target: ICD10,
      element: [
        {
          code: '73211009',
          display: 'Diabetes mellitus',
          target: [{ code: 'E11.9', display: 'Type 2 diabetes mellitus', equivalence: 'equivalent' }],
        },
      ],
    },
    {
      source: SNOMED,
      target: CPT,
      element: [
        {
          code: '5880005',
          display: 'Physical examination procedure',
          target: [{ code: '99213', display: 'Office/outpatient visit, established patient', equivalence: 'wider' }],
        },
      ],
    },
  ],
};

export const Empty = (): JSX.Element => (
  <Document>
    <ConceptMapBuilder
      value={{ resourceType: 'ConceptMap', status: 'draft' }}
      onSubmit={(formData) => console.log(JSON.stringify(formData, null, 2))}
    />
  </Document>
);

export const SingleGroup = (): JSX.Element => (
  <Document>
    <ConceptMapBuilder value={singleGroupExample} onSubmit={(formData) => console.log(JSON.stringify(formData, null, 2))} />
  </Document>
);

export const MultipleGroups = (): JSX.Element => (
  <Document>
    <ConceptMapBuilder value={multiGroupExample} onSubmit={(formData) => console.log(JSON.stringify(formData, null, 2))} />
  </Document>
);

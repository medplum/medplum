// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MedplumClient } from '@medplum/core';
import type { Condition, Patient } from '@medplum/fhirtypes';
const medplum = new MedplumClient();

const patientData: Patient =
  // start-block patient-example
  {
    resourceType: 'Patient',
    name: [
      {
        given: ['John'],
        family: 'Doe',
      },
    ],
    birthDate: '1980-07-15',
    gender: 'male',
  };
// end-block patient-example

await medplum.createResource(patientData);

const patientWithIdentifier: Patient =
  // start-block patient-with-identifier
  {
    resourceType: 'Patient',
    identifier: [
      // highlight-start
      {
        system: 'http://your-source-system.com/patientId',
        value: 'P001',
      },
      // highlight-end
    ],
    // ... other patient data
  };
// end-block patient-with-identifier

await medplum.createResource(patientWithIdentifier);

const conditionExample: Condition =
  // start-block condition-example
  {
    resourceType: 'Condition',
    identifier: [
      {
        system: 'http://your-source-system.com/patientConditionId',
        value: 'PC001',
      },
    ],
    subject: {
      reference: 'Patient/????',
    },
    code: {
      coding: [
        // highlight-start
        {
          system: 'http://your-source-system.com/conditionId',
          code: 'HT001',
          display: 'Hypertension',
        },
        // highlight-end
      ],
      text: 'Hypertension',
    },
  };
// end-block condition-example

const enrichedConditionExample: Condition = {
  // start-block enriched-condition-example
  ...conditionExample,
  code: {
    coding: [
      {
        system: 'http://your-source-system.com/conditionId',
        code: 'HT001',
        display: 'Hypertension',
      },
      // highlight-start
      {
        system: 'http://hl7.org/fhir/sid/icd-10',
        code: 'I10',
        display: 'Essential (primary) hypertension',
      },
      // highlight-end
    ],
    text: 'Hypertension',
  },
  onsetDateTime: '2022-03-15',
  // end-block enriched-condition-example
};

// Conditional References
const conditionalReferenceExample: Condition =
  // start-block conditional-reference-example
  {
    ...enrichedConditionExample,
    // highlight-start
    subject: {
      reference: 'Patient?identifier=http://your-source-system.com/patientId|P001',
    },
    // highlight-end
    // ...
  };
// end-block conditional-reference-example

await medplum.createResource(conditionalReferenceExample);

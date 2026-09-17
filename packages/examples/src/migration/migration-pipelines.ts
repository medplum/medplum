// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MedplumClient } from '@medplum/core';
import type { Bundle, Patient } from '@medplum/fhirtypes';
const medplum = new MedplumClient();

/*
// start-block curl-upsert
curl -X PUT "https://api.medplum.com/fhir/R4/Patient?identifier=http://your-source-system.com/patientId|P001" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "resourceType": "Patient",
    "identifier": [
      {
        "system": "http://your-source-system.com/patientId",
        "value": "P001"
      }
    ],
    "name": [
      {
        "given": ["John"],
        "family": "Doe"
      }
    ],
    "birthDate": "1980-07-15",
    "gender": "male"
  }'
// end-block curl-upsert
*/

/*
// start-block medplum-cli-upsert
medplum put "Patient?identifier=http://your-source-system.com/patientId|P001" \
'{
  "resourceType": "Patient",
  "identifier": [
    {
      "system": "http://your-source-system.com/patientId",
      "value": "P001"
    }
  ],
  "name": [
    {
      "given": ["John"],
      "family": "Doe"
    }
  ],
  "birthDate": "1980-07-15",
  "gender": "male"
}'
// end-block medplum-cli-upsert
*/

// start-block medplum-sdk-upsert
const patientData: Patient = {
  resourceType: 'Patient',
  identifier: [
    {
      system: 'http://your-source-system.com/patientId',
      value: 'P001',
    },
  ],
  name: [
    {
      given: ['John'],
      family: 'Doe',
    },
  ],
  birthDate: '1980-07-15',
  gender: 'male',
};

await medplum.upsertResource(patientData, {
  identifier: 'http://your-source-system.com/patientId|P001',
});
// end-block medplum-sdk-upsert

// Batches
const createPatientsBatch: Bundle =
  // start-block create-patients-batch
  {
    resourceType: 'Bundle',
    type: 'batch',
    entry: [
      {
        request: {
          method: 'PUT',
          url: 'Patient?identifier=http://your-source-system.com/patientId|P001',
        },
        resource: {
          resourceType: 'Patient',
          identifier: [
            {
              system: 'http://your-source-system.com/patientId',
              value: 'P001',
            },
          ],
          name: [
            {
              given: ['John'],
              family: 'Doe',
            },
          ],
          birthDate: '1980-07-15',
          gender: 'male',
        },
      },
      // Additional Patients...
    ],
  };
// end-block create-patients-batch
await medplum.executeBatch(createPatientsBatch);

// Transactions
const encounterAndImpressionTransaction: Bundle =
  // start-block encounter-and-impression-transaction
  {
    resourceType: 'Bundle',
    type: 'transaction',
    entry: [
      {
        fullUrl: 'urn:uuid:ddc3e8de-da12-42ad-831e-f659ef5af8f1',
        request: {
          method: 'PUT',
          url: 'Encounter?identifier=http://your-source-system.com/encounterId|E001',
        },
        resource: {
          resourceType: 'Encounter',
          identifier: [
            {
              system: 'http://your-source-system.com/encounterId',
              value: 'E001',
            },
          ],
          status: 'finished',
          class: {
            system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
            code: 'AMB',
            display: 'ambulatory',
          },
          subject: {
            reference: 'Patient?identifier=http://your-source-system.com/patientId|P001',
          },
          period: {
            start: '2023-06-15',
          },
          type: [
            {
              coding: [
                {
                  system: 'http://your-source-system.com/encounterTypeId',
                  code: 'checkup',
                  display: 'Check-up',
                },
              ],
            },
          ],
        },
      },
      {
        request: {
          method: 'PUT',
          url: 'ClinicalImpression?identifier=http://your-source-system.com/clinicalImpressionId|CI001',
        },
        resource: {
          resourceType: 'ClinicalImpression',
          identifier: [
            {
              system: 'http://your-source-system.com/clinicalImpressionId',
              value: 'CI001',
            },
          ],
          status: 'completed',
          subject: {
            reference: 'Patient?identifier=http://your-source-system.com/patientId|P001',
          },
          encounter: {
            reference: 'urn:uuid:ddc3e8de-da12-42ad-831e-f659ef5af8f1',
          },
          summary: 'Patient presented with mild flu-like symptoms. Recommended rest and fluids.',
        },
      },
    ],
  };
// end-block encounter-and-impression-transaction
await medplum.executeBatch(encounterAndImpressionTransaction);

// End to End Example
const createConditionsBatch: Bundle =
  // start-block create-conditions-batch
  {
    resourceType: 'Bundle',
    type: 'batch',
    entry: [
      /* -- Patient 1 -- */
      {
        request: {
          method: 'PUT',
          url: 'Condition?identifier=http://your-source-system.com/patientConditionId|PC001',
        },
        resource: {
          resourceType: 'Condition',
          identifier: [
            {
              system: 'http://your-source-system.com/patientConditionId',
              value: 'PC001',
            },
          ],
          subject: {
            reference: 'Patient?identifier=http://your-source-system.com/patientId|P001',
          },
          code: {
            coding: [
              {
                system: 'http://your-source-system.com/conditionId',
                code: 'HT001',
                display: 'Hypertension',
              },
              {
                system: 'http://hl7.org/fhir/sid/icd-10',
                code: 'I10',
                display: 'Essential (primary) hypertension',
              },
            ],
            text: 'Hypertension',
          },
          onsetDateTime: '2022-03-15',
        },
      },
      // Additional Conditions...
    ],
  };
// end-block create-conditions-batch
await medplum.executeBatch(createConditionsBatch);

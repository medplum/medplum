// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { createReference, MedplumClient } from '@medplum/core';
import type { Bundle, ClinicalImpression, Encounter, Patient } from '@medplum/fhirtypes';
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

const savedPatient = await medplum.upsertResource(patientData, {
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

// start-block encounter-and-impression-upserts
// Continue from the savedPatient returned by the Patient upsert above.
// This example permits an Encounter to exist before its assessment is loaded.
const savedEncounter = await medplum.upsertResource<Encounter>(
  {
    resourceType: 'Encounter',
    identifier: [{ system: 'http://your-source-system.com/encounterId', value: 'E001' }],
    status: 'finished',
    class: {
      system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
      code: 'AMB',
      display: 'ambulatory',
    },
    subject: createReference(savedPatient),
    period: { start: '2023-06-15' },
    type: [
      {
        coding: [{ system: 'http://your-source-system.com/encounterTypeId', code: 'checkup', display: 'Check-up' }],
      },
    ],
  },
  { identifier: 'http://your-source-system.com/encounterId|E001' }
);
// Persist the saved reference in the migration manifest before the dependent write.
await medplum.upsertResource<ClinicalImpression>(
  {
    resourceType: 'ClinicalImpression',
    identifier: [{ system: 'http://your-source-system.com/clinicalImpressionId', value: 'CI001' }],
    status: 'completed',
    subject: createReference(savedPatient),
    encounter: createReference(savedEncounter),
    summary: 'Patient presented with mild flu-like symptoms. Recommended rest and fluids.',
  },
  { identifier: 'http://your-source-system.com/clinicalImpressionId|CI001' }
);
// If the assessment fails, reconcile/retry that write; the Encounter remains saved.
// end-block encounter-and-impression-upserts

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

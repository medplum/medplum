import { MedplumClient } from '@medplum/core';
import { Bundle, Patient } from '@medplum/fhirtypes';
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
      {
        request: {
          method: 'PUT',
          url: 'Patient?identifier=http://your-source-system.com/patientId|P002',
        },
        resource: {
          resourceType: 'Patient',
          identifier: [
            {
              system: 'http://your-source-system.com/patientId',
              value: 'P002',
            },
          ],
          name: [
            {
              given: ['Jane'],
              family: 'Smith',
            },
          ],
          birthDate: '1992-11-30',
          gender: 'female',
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
            start: '2023-06-15T09:00:00Z',
            end: '2023-06-15T09:30:00Z',
          },
        },
      },
      {
        fullUrl: 'urn:uuid:fd801e1f-0788-4920-9609-33ed84c7b39b',
        request: {
          method: 'PUT',
          url: 'ClinicalImpression?encounter=Encounter?identifier=http://your-source-system.com/encounterId|E001',
        },
        resource: {
          resourceType: 'ClinicalImpression',
          status: 'completed',
          subject: {
            reference: 'Patient?identifier=http://your-source-system.com/patientId|P001',
          },
          encounter: {
            reference: 'urn:uuid:ddc3e8de-da12-42ad-831e-f659ef5af8f1',
          },
          effectiveDateTime: '2023-06-15T09:30:00Z',
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
      {
        request: {
          method: 'PUT',
          url: 'Condition?identifier=http://your-source-system.com/patientConditionId|PC002',
        },
        resource: {
          resourceType: 'Condition',
          identifier: [
            {
              system: 'http://your-source-system.com/patientConditionId',
              value: 'PC002',
            },
          ],
          subject: {
            reference: 'Patient?identifier=http://your-source-system.com/patientId|P001',
          },
          code: {
            coding: [
              {
                system: 'http://your-source-system.com/conditionId',
                code: 'DM002',
                display: 'Diabetes',
              },
              {
                system: 'http://hl7.org/fhir/sid/icd-10',
                code: 'E11',
                display: 'Type 2 diabetes mellitus',
              },
            ],
            text: 'Diabetes',
          },
          onsetDateTime: '2023-01-10',
        },
      },
      /* -- Patient 2 -- */
      {
        request: {
          method: 'PUT',
          url: 'Condition?identifier=http://your-source-system.com/patientConditionId|PC003',
        },
        resource: {
          resourceType: 'Condition',
          identifier: [
            {
              system: 'http://your-source-system.com/patientConditionId',
              value: 'PC003',
            },
          ],
          subject: {
            reference: 'Patient?identifier=http://your-source-system.com/patientId|P002',
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
          onsetDateTime: '2023-02-22',
        },
      },
      // Additional Conditions...
    ],
  };
// end-block create-conditions-batch
await medplum.executeBatch(createConditionsBatch);

const createEncountersAndImpressionsBatch: Bundle =
  // start-block create-encounters-and-impressions-batch-transaction
  {
    resourceType: 'Bundle',
    // The overall request is a batch request
    // highlight-next-line
    type: 'batch',
    entry: [
      // Each entry is a in the batch is a transaction
      /* -- Transaction 1 -- */
      {
        request: {
          method: 'POST',
          url: '/',
        },
        resource: {
          resourceType: 'Bundle',
          // highlight-next-line
          type: 'transaction',
          entry: [
            {
              fullUrl: 'urn:uuid:fd801e1f-0788-4920-9609-33ed84c7b39b',
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
                  start: '2023-06-15T00:00:00Z',
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
              fullUrl: 'urn:uuid:afb1dbb9-3801-4411-9a0b-75672742b0d4',
              request: {
                method: 'POST',
                url: 'ClinicalImpression',
              },
              resource: {
                resourceType: 'ClinicalImpression',
                status: 'completed',
                subject: {
                  reference: 'Patient?identifier=http://your-source-system.com/patientId|P001',
                },
                encounter: {
                  reference: 'urn:uuid:fd801e1f-0788-4920-9609-33ed84c7b39b',
                },
                effectiveDateTime: '2023-06-15T00:00:00Z',
                summary:
                  "Routine check-up. Patient's hypertension is well-controlled. Diabetes management plan reviewed.",
              },
            },
          ],
        },
      },
      /* -- Transaction 2 -- */
      {
        request: {
          method: 'POST',
          url: '/',
        },
        resource: {
          resourceType: 'Bundle',
          // highlight-next-line
          type: 'transaction',
          entry: [
            {
              fullUrl: 'urn:uuid:309daee6-3512-4c38-9b96-a5243716dec1',
              request: {
                method: 'PUT',
                url: 'Encounter?identifier=http://your-source-system.com/encounterId|E002',
              },
              resource: {
                resourceType: 'Encounter',
                identifier: [
                  {
                    system: 'http://your-source-system.com/encounterId',
                    value: 'E002',
                  },
                ],
                status: 'finished',
                class: {
                  system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
                  code: 'EMER',
                  display: 'emergency',
                },
                subject: {
                  reference: 'Patient?identifier=http://your-source-system.com/patientId|P002',
                },
                period: {
                  start: '2023-06-16T00:00:00Z',
                },
                type: [
                  {
                    coding: [
                      {
                        system: 'http://your-source-system.com/encounterTypeId',
                        code: 'emergency',
                        display: 'Emergency',
                      },
                    ],
                  },
                ],
              },
            },
            {
              fullUrl: 'urn:uuid:d9491f52-15a1-4ae6-9ee1-b0a91421fe17',
              request: {
                method: 'POST',
                url: 'ClinicalImpression',
              },
              resource: {
                resourceType: 'ClinicalImpression',
                status: 'completed',
                subject: {
                  reference: 'Patient?identifier=http://your-source-system.com/patientId|P002',
                },
                encounter: {
                  reference: 'urn:uuid:309daee6-3512-4c38-9b96-a5243716dec1',
                },
                effectiveDateTime: '2023-06-16T00:00:00Z',
                summary:
                  "Emergency visit due to severe headache. Patient's hypertension may need adjustment. Further tests ordered.",
              },
            },
          ],
        },
      },
    ],
  };
// end-block create-encounters-and-impressions-batch-transaction
await medplum.executeBatch(createEncountersAndImpressionsBatch);

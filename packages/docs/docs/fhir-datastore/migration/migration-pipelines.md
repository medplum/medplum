---
id: migration-pipelines
toc_max_heading_level: 3
sidebar_position: 4
---

[patient]: /docs/api/fhir/resources/patient
[condition]: /docs/api/fhir/resources/condition
[encounter]: /docs/api/fhir/resources/encounter
[clinicalimpression]: /docs/api/fhir/resources/clinicalimpression

# Building Migration Pipelines

When migrating data to Medplum, it's crucial to build efficient and reliable data pipelines. This section covers key strategies and best practices for constructing pipelines to migration data *into* Medplum.

## Using Conditional Updates for Idempotency

Conditional updates are essential to create idempotent migration pipelines. This means you can run your migration multiple times without creating duplicate data.

To perform a conditional update, use a `PUT` operation with a search query in the URL:

```
PUT /Patient?identifier=http://your-source-system.com/patientId|P001

{
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
}
```

The semantics of this operation are:
* If 0 resources are found matching the search query, a new resource is created.
* If 1 resource is found, it is updated with the provided data.
* If more than 1 resource is found, an error is returned.

This approach ensures that your operation is idempotent and can be safely repeated.

You can read more about Conditional Updates [here](/docs/fhir-datastore/create-fhir-data#upsert).

## Using Batches Requests for Efficiency

You can use [FHIR batch request](/docs/fhir-datastore/fhir-batch-requests) allow you to combine multiple operations into a single API call, improving efficiency.

Batch requests are a great option to improve throughput when performing multiple independent operations, each of which can succeed or fail independently.

#### Example: Writing Multiple Patient Resources

Here's an example of using a batch to create multiple [`Patient`](patient) resources:

```js
{
  "resourceType": "Bundle",
  "type": "batch",
  "entry": [
    {
      "request": {
        "method": "PUT",
        "url": "Patient?identifier=http://your-source-system.com/patientId|P001"
      },
      "resource": {
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
      }
    },
    {
      "request": {
        "method": "PUT",
        "url": "Patient?identifier=http://your-source-system.com/patientId|P002"
      },
      "resource": {
        "resourceType": "Patient",
        "identifier": [
          {
            "system": "http://your-source-system.com/patientId",
            "value": "P002"
          }
        ],
        "name": [
          {
            "given": ["Jane"],
            "family": "Smith"
          }
        ],
        "birthDate": "1992-11-30",
        "gender": "female"
      }
    }
    //...
  ]
}
```

This batch operation creates (or updates) two [`Patient`](patient) resources in a single API call, using conditional updates for each entry to avoid data duplication.

## Using Transactions for Data Integrity

[FHIR Transactions](/docs/fhir-datastore/fhir-batch-requests#creating-internal-references) ensure that a set of resources are written together or fail together, maintaining data integrity. However, transactions are generally slower and are capped at 20 resources per transaction.

#### Example: Encounter with Clinical Impression

Here's an example of using a transaction to create an [`Encounter`] and associated [`ClinicalImpression`] (i.e. clinical notes) together. We use a transaction because the failure of one operation should invalidate the entire transaction.

```js
{
  "resourceType": "Bundle",
  "type": "transaction",
  "entry": [
    {
      "fullUrl": "urn:uuid:encounter-123",
      "request": {
        "method": "PUT",
        "url": "Encounter?identifier=http://your-source-system.com/encounterId|E001"
      },
      "resource": {
        "resourceType": "Encounter",
        "identifier": [
          {
            "system": "http://your-source-system.com/encounterId",
            "value": "E001"
          }
        ],
        "status": "finished",
        "class": {
          "system": "http://terminology.hl7.org/CodeSystem/v3-ActCode",
          "code": "AMB",
          "display": "ambulatory"
        },
        "subject": {
          "reference": "Patient?identifier=http://your-source-system.com/patientId|P001"
        },
        "period": {
          "start": "2023-06-15T09:00:00Z",
          "end": "2023-06-15T09:30:00Z"
        }
      }
    },
    {
      "fullUrl": "urn:uuid:clinicalimpression-456",
      "request": {
        "method": "PUT",
        "url": "ClinicalImpression?encounter=Encounter?identifier=http://your-source-system.com/encounterId|E001"
      },
      "resource": {
        "resourceType": "ClinicalImpression",
        "status": "completed",
        "subject": {
          "reference": "Patient?identifier=http://your-source-system.com/patientId|P001"
        },
        "encounter": {
          "reference": "urn:uuid:encounter-123"
        },
        "effectiveDateTime": "2023-06-15T09:30:00Z",
        "summary": "Patient presented with mild flu-like symptoms. Recommended rest and fluids."
      }
    }
  ]
}
```

In this transaction, both the Encounter and ClinicalImpression are created together. If either fails, the entire transaction is rolled back.

## 3.4 Combining Batches and Transactions

For large-scale migrations, you can combine batches and transactions to balance performance and data integrity. Create batches of smaller transactions to avoid the performance hit of very large transactions while still maintaining atomicity for related resources.

## An End-to-End Example

Let's demonstrate a complete data pipeline that incorporates all the concepts we've discussed. We'll migrate patients, conditions, encounters, and clinical impressions in separate steps.

### Source Data

#### Patients Table
```
| patient_id | first_name | last_name | birth_date | gender |
| ---------- | ---------- | --------- | ---------- | ------ |
| P001       | John       | Doe       | 1980-07-15 | M      |
| P002       | Jane       | Smith     | 1992-11-30 | F      |
```

#### Conditions Table
```
| condition_id | condition_name | icd10_code |
| ------------ | -------------- | ---------- |
| HT001        | Hypertension   | I10        |
| DM002        | Diabetes       | E11        |
```

#### Patient_Conditions Table:
```
| patient_condition_id | patient_id | condition_id | onset_date |
| -------------------- | ---------- | ------------ | ---------- |
| PC001                | P001       | HT001        | 2022-03-15 |
| PC002                | P001       | DM002        | 2023-01-10 |
| PC003                | P002       | HT001        | 2023-02-22 |
```

#### Encounters Table:
```
| encounter_id | patient_id | date       | type      |
| ------------ | ---------- | ---------- | --------- |
| E001         | P001       | 2023-06-15 | checkup   |
| E002         | P002       | 2023-06-16 | emergency |
```

### Step 1: Create Patients
Use a batch request to upload [`Patients`](patient) independently, using the primary key from the source system as the identifier.

```js
{
  "resourceType": "Bundle",
  "type": "batch",
  "entry": [
    {
      "request": {
        "method": "PUT",
        "url": "Patient?identifier=http://your-source-system.com/patientId|P001"
      },
      "resource": {
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
      }
    },
    {
      "request": {
        "method": "PUT",
        "url": "Patient?identifier=http://your-source-system.com/patientId|P002"
      },
      "resource": {
        "resourceType": "Patient",
        "identifier": [
          {
            "system": "http://your-source-system.com/patientId",
            "value": "P002"
          }
        ],
        "name": [
          {
            "given": ["Jane"],
            "family": "Smith"
          }
        ],
        "birthDate": "1992-11-30",
        "gender": "female"
      }
    }
  ]
}
```

### Step 2: Create Conditions

Use a batch request to upload [`Conditions`](condition) independently, using conditional references to link to the existing patients.

```js
{
  "resourceType": "Bundle",
  "type": "batch",
  "entry": [
    // First condition for Patient P001
    {
      "request": {
        "method": "PUT",
        "url": "Condition?identifier=http://your-source-system.com/patientConditionId|PC001"
      },
      "resource": {
        "resourceType": "Condition",
        "identifier": [
          {
            "system": "http://your-source-system.com/patientConditionId",
            "value": "PC001"
          }
        ],
        "subject": {
          "reference": "Patient?identifier=http://your-source-system.com/patientId|P001"
        },
        "code": {
          "coding": [
            {
              "system": "http://your-source-system.com/conditionId",
              "code": "HT001",
              "display": "Hypertension"
            },
            {
              "system": "http://hl7.org/fhir/sid/icd-10",
              "code": "I10",
              "display": "Essential (primary) hypertension"
            }
          ],
          "text": "Hypertension"
        },
        "onsetDateTime": "2022-03-15"
      }
    },
    // Second condition for Patient P001
    {
      "request": {
        "method": "PUT",
        "url": "Condition?identifier=http://your-source-system.com/patientConditionId|PC002"
      },
      "resource": {
        "resourceType": "Condition",
        "identifier": [
          {
            "system": "http://your-source-system.com/patientConditionId",
            "value": "PC002"
          }
        ],
        "subject": {
          "reference": "Patient?identifier=http://your-source-system.com/patientId|P001"
        },
        "code": {
          "coding": [
            {
              "system": "http://your-source-system.com/conditionId",
              "code": "DM002",
              "display": "Diabetes"
            },
            {
              "system": "http://hl7.org/fhir/sid/icd-10",
              "code": "E11",
              "display": "Type 2 diabetes mellitus"
            }
          ],
          "text": "Diabetes"
        },
        "onsetDateTime": "2023-01-10"
      }
    },
    // First condition for Patient P002
    {
      "request": {
        "method": "PUT",
        "url": "Condition?identifier=http://your-source-system.com/patientConditionId|PC003"
      },
      "resource": {
        "resourceType": "Condition",
        "identifier": [
          {
            "system": "http://your-source-system.com/patientConditionId",
            "value": "PC003"
          }
        ],
        "subject": {
          "reference": "Patient?identifier=http://your-source-system.com/patientId|P002"
        },
        "code": {
          "coding": [
            {
              "system": "http://your-source-system.com/conditionId",
              "code": "HT001",
              "display": "Hypertension"
            },
            {
              "system": "http://hl7.org/fhir/sid/icd-10",
              "code": "I10",
              "display": "Essential (primary) hypertension"
            }
          ],
          "text": "Hypertension"
        },
        "onsetDateTime": "2023-02-22"
      }
    }
  ]
}
```

### Step 3: Create Encounters and ClinicalImpressions

Here, we use a batch request, where each entry is a two-operation transaction to create the [`Encounter`](encounter`) and dependent [`ClinicalImpression`](clinicalimpression) (i.e. note).

```js
{
  "resourceType": "Bundle",
  // The overall request is a batch request
  // highlight-next-line
  "type": "batch",
  "entry": [
    {
      "request": {
        "method": "POST",
        "url": "/"
      },
      // Each entry is a in the batch is a transaction
      "resource": {
        "resourceType": "Bundle",
        // highlight-next-line
        "type": "transaction",
        "entry": [
          {
            "fullUrl": "urn:uuid:encounter-e001",
            "request": {
              "method": "PUT",
              "url": "Encounter?identifier=http://your-source-system.com/encounterId|E001"
            },
            "resource": {
              "resourceType": "Encounter",
              "identifier": [
                {
                  "system": "http://your-source-system.com/encounterId",
                  "value": "E001"
                }
              ],
              "status": "finished",
              "class": {
                "system": "http://terminology.hl7.org/CodeSystem/v3-ActCode",
                "code": "AMB",
                "display": "ambulatory"
              },
              "subject": {
                "reference": "Patient?identifier=http://your-source-system.com/patientId|P001"
              },
              "period": {
                "start": "2023-06-15T00:00:00Z"
              },
              "type": [
                {
                  "coding": [
                    {
                      "system": "http://your-source-system.com/encounterTypeId",
                      "code": "checkup",
                      "display": "Check-up"
                    }
                  ]
                }
              ]
            }
          },
          {
            "fullUrl": "urn:uuid:clinicalimpression-e001",
            "request": {
              "method": "POST",
              "url": "ClinicalImpression"
            },
            "resource": {
              "resourceType": "ClinicalImpression",
              "status": "completed",
              "subject": {
                "reference": "Patient?identifier=http://your-source-system.com/patientId|P001"
              },
              "encounter": {
                "reference": "urn:uuid:encounter-e001"
              },
              "effectiveDateTime": "2023-06-15T00:00:00Z",
              "summary": "Routine check-up. Patient's hypertension is well-controlled. Diabetes management plan reviewed."
            }
          }
        ]
      }
    },
    // Each entry is a in the batch is a transaction
    {
      "request": {
        "method": "POST",
        "url": "/"
      },
      "resource": {
        "resourceType": "Bundle",
        // highlight-next-line
        "type": "transaction",
        "entry": [
          {
            "fullUrl": "urn:uuid:encounter-e002",
            "request": {
              "method": "PUT",
              "url": "Encounter?identifier=http://your-source-system.com/encounterId|E002"
            },
            "resource": {
              "resourceType": "Encounter",
              "identifier": [
                {
                  "system": "http://your-source-system.com/encounterId",
                  "value": "E002"
                }
              ],
              "status": "finished",
              "class": {
                "system": "http://terminology.hl7.org/CodeSystem/v3-ActCode",
                "code": "EMER",
                "display": "emergency"
              },
              "subject": {
                "reference": "Patient?identifier=http://your-source-system.com/patientId|P002"
              },
              "period": {
                "start": "2023-06-16T00:00:00Z"
              },
              "type": [
                {
                  "coding": [
                    {
                      "system": "http://your-source-system.com/encounterTypeId",
                      "code": "emergency",
                      "display": "Emergency"
                    }
                  ]
                }
              ]
            }
          },
          {
            "fullUrl": "urn:uuid:clinicalimpression-e002",
            "request": {
              "method": "POST",
              "url": "ClinicalImpression"
            },
            "resource": {
              "resourceType": "ClinicalImpression",
              "status": "completed",
              "subject": {
                "reference": "Patient?identifier=http://your-source-system.com/patientId|P002"
              },
              "encounter": {
                "reference": "urn:uuid:encounter-e002"
              },
              "effectiveDateTime": "2023-06-16T00:00:00Z",
              "summary": "Emergency visit due to severe headache. Patient's hypertension may need adjustment. Further tests ordered."
            }
          }
        ]
      }
    }
  ]
}
```

This example demonstrates:

1. Using separate batch requests for different resource types ([`Patients`](patient) and [`Conditions`](condition)).
2. Employing conditional updates for idempotency.
3. Using conditional references to link [`Conditions`](condition) to [`Patients`](patient).
4. Creating a batch of transactions to ensure [`Encounters`](encounter) and [`ClinicalImpressions`](clinicalimpression) are created together.
5. Using `urn:uuid` references within transactions to link newly created resources.
6. Maintaining relationships between resources across different requests using conditional references.

This approach allows for efficient bulk operations while ensuring data integrity for related resources. It also demonstrates how to handle different types of relationships and references in a complex data migration scenario.


**In the next guide, we'll talk about best practices for adopting Medplum in end user workflows.**
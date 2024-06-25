---
toc_max_heading_level: 3
sidebar_position: 4
---

import ExampleCode from '!!raw-loader!@site/../examples/src/migration/migration-pipelines.ts';
import MedplumCodeBlock from '@site/src/components/MedplumCodeBlock';

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';


# Building Migration Pipelines

When migrating data to Medplum, it's crucial to build efficient and reliable data pipelines. This section covers key strategies and best practices for constructing pipelines to migration data *into* Medplum.

[patient]: /docs/api/fhir/resources/patient
[condition]: /docs/api/fhir/resources/condition
[encounter]: /docs/api/fhir/resources/encounter
[clinicalimpression]: /docs/api/fhir/resources/clinicalimpression

## Using Conditional Updates for Idempotency

Conditional updates are essential to create idempotent migration pipelines. This means you can run your migration multiple times without creating duplicate data.

To perform a conditional update, use a `PUT` operation with a search query in the URL:


<Tabs groupId="language">
  <TabItem value="ts" label="TypeScript">
    <MedplumCodeBlock language="ts" selectBlocks="medplum-sdk-upsert">
      {ExampleCode}
    </MedplumCodeBlock>
  </TabItem>
  <TabItem value="curl" label="cURL">
    <MedplumCodeBlock language="bash" selectBlocks="curl-upsert">
      {ExampleCode}
    </MedplumCodeBlock>
  </TabItem>
  <TabItem value="cli" label="CLI">
    <MedplumCodeBlock language="bash" selectBlocks="medplum-cli-upsert">
      {ExampleCode}
    </MedplumCodeBlock>
  </TabItem>
</Tabs>

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

Here's an example of using a batch to create multiple [`Patient`][patient] resources:

<MedplumCodeBlock language="ts" selectBlocks="create-patients-batch">
    {ExampleCode}
</MedplumCodeBlock>

This batch operation creates (or updates) two [`Patient`][patient] resources in a single API call, using conditional updates for each entry to avoid data duplication.

## Using Transactions for Data Integrity

[FHIR Transactions](/docs/fhir-datastore/fhir-batch-requests#creating-internal-references) ensure that a set of resources are written together or fail together, maintaining data integrity. However, transactions are generally slower and are capped at 20 resources per transaction.

#### Example: Encounter with Clinical Impression

Here's an example of using a transaction to create an [`Encounter`][encounter] and associated [`ClinicalImpression`][clinicalimpression] (i.e. clinical notes) together. We use a transaction because the failure of one operation should invalidate the entire transaction.

<MedplumCodeBlock language="ts" selectBlocks="encounter-and-impression-transaction">
    {ExampleCode}
</MedplumCodeBlock>

In this transaction, both the Encounter and ClinicalImpression are created together. If either fails, the entire transaction is rolled back.

## Combining Batches and Transactions

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
Use a batch request to upload [`Patients`][patient] independently, using the primary key from the source system as the identifier.

<MedplumCodeBlock language="ts" selectBlocks="create-patients-batch">
    {ExampleCode}
</MedplumCodeBlock>

### Step 2: Create Conditions

Use a batch request to upload [`Conditions`][condition] independently, using conditional references to link to the existing patients.

<MedplumCodeBlock language="ts" selectBlocks="create-conditions-batch">
    {ExampleCode}
</MedplumCodeBlock>


### Step 3: Create Encounters and ClinicalImpressions

Here, we use a batch request, where each entry is a two-operation transaction to create the [`Encounter`][encounter] and dependent [`ClinicalImpression`][clinicalimpression] (i.e. note).

<MedplumCodeBlock language="ts" selectBlocks="create-encounters-and-impressions-batch-transaction">
    {ExampleCode}
</MedplumCodeBlock>


This example demonstrates:

1. Using separate batch requests for different resource types ([`Patients`][patient] and [`Conditions`][condition]).
2. Employing conditional updates for idempotency.
3. Using conditional references to link [`Conditions`][condition] to [`Patients`][patient].
4. Creating a batch of transactions to ensure [`Encounters`][encounter] and [`ClinicalImpressions`][clinicalimpression] are created together.
5. Using `urn:uuid` references within transactions to link newly created resources.
6. Maintaining relationships between resources across different requests using conditional references.

This approach allows for efficient bulk operations while ensuring data integrity for related resources. It also demonstrates how to handle different types of relationships and references in a complex data migration scenario.



In the next guide, we'll talk about **best practices for adopting Medplum in end user workflows.**
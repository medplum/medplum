---
id: convert-to-fhir
toc_max_heading_level: 3
sidebar_position: 4
---

import ExampleCode from '!!raw-loader!@site/../examples/src/migration/convert-to-fhir.ts';
import MedplumCodeBlock from '@site/src/components/MedplumCodeBlock';

# Converting Data to FHIR

[patient]: /docs/api/fhir/resources/patient
[codeableconcept]: /docs/fhir-basics#standardizing-data-codeable-concepts
[condition]: /docs/api/fhir/resources/condition

This guide covers reshaping source data into FHIR R4 resources, preserving source identifiers, mapping coded values, and maintaining references between resources.

Before implementing these transformations, document and approve them using [Governing Data Mappings](/docs/migration/mapping-governance). A FHIR resource can be structurally valid while still misrepresenting the source meaning.

## Reshaping Data Elements from the Source

When converting your data to FHIR resources, you'll need to map your existing data elements to the appropriate FHIR resource fields. This process involves:

1. Identifying the corresponding FHIR resource type for each data entity in your source system.
2. Mapping individual data fields to FHIR resource attributes.
3. Transforming data formats to match FHIR requirements (e.g., date formats, name structures).

Here's a simple example of how you might map fields from a source system to FHIR:

Source System (Patient table):

```
| id   | first_name | last_name | dob        | gender |
| ---- | ---------- | --------- | ---------- | ------ |
| P001 | John       | Doe       | 1980-07-15 | M      |
```

FHIR [`Patient`][patient] Resource:
<MedplumCodeBlock language="ts" selectBlocks="patient-example">
{ExampleCode}
</MedplumCodeBlock>

## Using FHIR Identifiers to Link to the Source System

To maintain traceability and link back to your source system, it's crucial to add the primary keys from your source system as [identifiers](/docs/fhir-basics#naming-data-identifiers) in Medplum.

Adding source system identifiers helps in:

- Tracking the origin of each resource
- Facilitating data reconciliation and auditing
- Allows updates that are safe to repeat

### Example

<MedplumCodeBlock language="ts" selectBlocks="patient-with-identifier">
  {ExampleCode}
</MedplumCodeBlock>

## Dealing with CodeableConcepts

Many FHIR elements use [`CodeableConcept`][codeableconcept] to represent coded meaning. Standard codes improve interoperability, but they should be added only when the source value has a verified mapping.

It's great if your source data is already annotated with standard codes. Even if this isn't the case, you can:

1. Add a [local code](/docs/terminology/local-codes) representing your internal coding scheme
2. Enrich your data with standard codes in a separate process

### Example

Let's look at an example of converting condition data to a FHIR Condition resource. First, we'll show what the existing data might look like in a tabular form:

`Conditions` Table:

```
| condition_id | condition_name |
| ------------ | -------------- |
| HT001        | Hypertension   |
```

`Patient_Conditions` Table:

```
| patient_condition_id | patient_id | condition_id |
| -------------------- | ---------- | ------------ |
| PC001                | P001       | HT001        |
```

Now, let's convert this data to a FHIR Condition resource:

Initially, with just the local code:

<MedplumCodeBlock language="ts" selectBlocks="condition-example">
  {ExampleCode}
</MedplumCodeBlock>

Later, enriched with a standard ICD-10 code:

:::caution[Verify terminology mappings]

The coding below illustrates the shape of an approved mapping. Do not infer a standard code from display text alone. Verify the source-to-target relationship with an authoritative terminology source and human review.

:::

<MedplumCodeBlock language="ts" selectBlocks="enriched-condition-example">
  {ExampleCode}
</MedplumCodeBlock>

In this example:

1. We start with local codes from the source system, which allows us to maintain traceability back to the original data.
2. We later augment the data with a standard ICD-10 code. This improves interoperability with other systems that understand ICD-10 codes.
3. The `text` field provides a human-readable description of the condition.

When implementing this in your migration pipeline:

- Map your local codes to FHIR [`Condition`][condition] resources, using the `patient_condition_id` as an identifier.
- Create a separate, offline process to map your local condition codes to standard codes (like ICD-10).
- Update the [`Condition`][condition] resources with the standard codes, either during the initial migration if the mapping is available, or as a separate step later.

The use of the `patient_condition_id` as an identifier provides a clear link back to the original data, which can be valuable for auditing, troubleshooting, or further data reconciliation.

This approach allows you to migrate your data quickly while still maintaining the ability to add standardized coding later, improving the overall quality and interoperability of your data over time.

## Mapping Source Values to FHIR ValueSets

In addition to `CodeableConcepts`, FHIR uses ValueSets to constrain elements whose values are plain codes. Status fields are a common migration problem: a legacy `is_active` boolean may collapse several workflow states that FHIR represents separately.

Check the binding on the target element before writing the transformation. A **required** binding means the code must come from the bound ValueSet. An **extensible** binding uses a code from the ValueSet when it represents the concept, a **preferred** binding encourages those codes, and an **example** binding only illustrates possible values. Whatever the binding strength, the selected value must preserve the source meaning. The allowed values and their meanings can differ between resources.

For example, consider a legacy care-plan status:

| Source value | Documented source meaning                 | `CarePlan.status` mapping |
| :----------- | :---------------------------------------- | :------------------------ |
| `true`       | The care plan is currently being followed | `active`                  |
| `false`      | The care plan is not active                | No direct mapping         |

The `false` value does not say whether the plan is `on-hold`, `revoked`, `completed`, or `entered-in-error`. Use additional source fields or business rules to distinguish those states. If the source cannot support that distinction, route the record for an approved fallback or review instead of guessing.

Review the target resource's element definitions, such as [`CarePlan.status`](/docs/api/fhir/resources/careplan), and record the source-to-code relationship in [Governing Data Mappings](/docs/migration/mapping-governance#record-terminology-decisions). Test every observed source value, including blanks and unexpected values.

## Linking Data Using Conditional References

When migrating data to FHIR, it's crucial to maintain relationships between resources. Conditional references are particularly helpful in this process.

During migration, it's often challenging to know the [unique `id`](/docs/fhir-basics#storing-data-resources) that Medplum will assign to a resource once it's created. You may have noticed the reference to `Patient/????` in the previous example.

Conditional references solve these issues by allowing you to reference resources based on their identifying information from the source system, rather than relying on Medplum-generated IDs.

### Example

Let's amend the previous example to use a conditional reference to link our [`Condition`][condition] to the [`Patient`][patient].

<MedplumCodeBlock language="ts" selectBlocks="conditional-reference-example">
  {ExampleCode}
</MedplumCodeBlock>

With this modification, we no longer have to look up the [`Patient's`][patient] `id` value in Medplum before writing the [`Condition`][condition]. The server resolves `identifier=http://your-source-system.com/patientId|P001` to the existing Patient during the write.

## Next Steps

Continue with patient `P001` in [Building Migration Pipelines](/docs/migration/migration-pipelines), which applies these mapping, identifier, coding, and reference patterns to batches and transactions.

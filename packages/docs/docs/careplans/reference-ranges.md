import MedplumCodeBlock from '@site/src/components/MedplumCodeBlock';
import ExampleCode from '!!raw-loader!@site/..//examples/src/careplans/reference-ranges.ts';

# Observation Reference Ranges

In on our previous guide about [creating diagnostic services catalog](./laboratory-services), we described the importance of the [`ObservationDefinition`](/docs/api/fhir/resources/observationdefinition) resource for storing metadata about the [`Observations`](/docs/api/fhir/resources/observation) produced by the test. This metadata is not just for ensuring data correctness, but also a key component in assisting providers with data interpretation.

A core part of interpreting results of this metadata is the definition of **reference ranges**, sets of [`Observation`](/docs/api/fhir/resources/observation) values that share a diagnostic interpretation.

In this guide, we'll take a closer look at how administrators can use the [`ObservationDefinition`](/docs/api/fhir/resources/observationdefinition) resource to define these ranges of interest. We'll cover the following key areas:

1. Defining a reference range.
2. Establishing age and gender-dependent ranges.
3. Understanding the types of ranges that FHIR supports.
4. Editing reference ranges in the medplum UI.
5. Defining ranges for non-numerical Observations.

## Defining a Reference Range

A reference range is defined using the `ObservationDefinition.qualifiedInterval` element. This is an array field, which allows administrators to define mulitple ranges of interest for a single [`Observation`](/docs/api/fhir/resources/observation).

A range is defined by the following properties:

| **Element**                         | Description                                                                                | Example   |
| ----------------------------------- | ------------------------------------------------------------------------------------------ | --------- |
| `qualifiedInterval.range.low`       | Lower bound for the reference range, inclusive. <br />(Empty value denotes no lower bound) | 10 mg/dL  |
| `qualifiedInterval.range.high`      | Upper bound for the reference range, inclusive. <br />(Empty value denotes no upper bound) | 100 mg/dL |
| `qualifiedInterval.range.condition` | How to interpret observation values in this interval                                       | "High"    |

<details><summary>Example: 10 - 100 mg/dL</summary>
  <MedplumCodeBlock language="ts" selectBlocks="midRange">
    {ExampleCode}
  </MedplumCodeBlock>
</details>

<details><summary>Example: Less or equal to than 5 mg/dL </summary>
  <MedplumCodeBlock la nguage="ts" selectBlocks="lowRange">
    {ExampleCode}
  </MedplumCodeBlock>
</details>

<details><summary>Example: Greater than or equal to 20 mg/dL </summary>
  <MedplumCodeBlock language="ts" selectBlocks="highRange">
    {ExampleCode}
  </MedplumCodeBlock>
</details>

In practice, multiple an [`ObservationDefinition`](/docs/api/fhir/resources/observationdefinition) will define multiple reference ranges for a given patient population, to provide interpretations for each value of the [`Observation`](/docs/api/fhir/resources/observation).

<details><summary>Example </summary>
The example below defines three reference ranges, to be interpreted as "Low", "Normal", and "High".

  <MedplumCodeBlock language="ts" selectBlocks="allRanges">
    {ExampleCode}
  </MedplumCodeBlock>
</details>

## Patient-dependent reference ranges

Patient demographics can influence the interpretation of some diagnostic test results.

To handle this, the [`ObservationDefinition`](/docs/api/fhir/resources/observationdefinition) resource allows for defining reference ranges that can be either tailored to specific patient demographics or universally applied.

The table below describes which patient attributes can be used to target reference ranges.

| **Attribute**       | Element                            | **Type**        | Code System                                                                                              | Example |
| ------------------- | ---------------------------------- | --------------- | -------------------------------------------------------------------------------------------------------- | ------- |
| Age                 | `qualifiedInterval.age`            | Range           |                                                                                                          |         |
| Gender              | `qualifiedInterval.gender`         | code            | [AdministrativeGender](https://hl7.org/fhir/R4/valueset-administrative-gender.html)                      | female  |
| Gestational Age     | `qualifiedInterval.gestationalAge` | Range           |                                                                                                          |         |
| Racial/Ethnic Group | `qualifiedInterval.appliesTo`      | CodeableConcept | _(Example)_ [OMB Race Categories](https://build.fhir.org/ig/HL7/US-Core/ValueSet-omb-race-category.html) | Asian   |

<details><summary>Example </summary>
The example below demonstrates how to represent different normal ranges for a testosterone test, for both adults and children.
  <MedplumCodeBlock language="ts" selectBlocks="testosterone">
    {ExampleCode}
  </MedplumCodeBlock>
</details>

:::note

For any range, if these demographic qualifiers are left unspecified, the system interprets it as a universal range applicable to all patients.

:::

:::tip Matching [`Patients`](/docs/api/fhir/resources/patient) to reference ranges

The Medplum SDK provides helper functions,[ `findObservationInterval`](/docs/sdk/modules#findobservationinterval), [`findObservationReferenceRange`](/docs/sdk/modules#findobservationreferencerange), and [`matchesRange`](/docs/sdk/modules#matchesrange) to find reference ranges that match a particular patient.

<details><summary>Example</summary>

  <MedplumCodeBlock language="ts" selectBlocks="findInterval">
    {ExampleCode}
  </MedplumCodeBlock>

</details>

:::

## Types of reference ranges

Reference ranges can be categorized into three different types:

|    Field    | Description                                                                                                                                                          |
| :---------: | :------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `reference` | Defines the normal ranges for a given observation type.                                                                                                              |
| `critical`  | Defines the "critical" values for the observation, also known as "panic" values. Observing values in these ranges often require special handling to notify patients. |
| `absolute`  | The absolute allowable range for this value (i.e. the measurable range). Values outside of this range are not possible / sensible.                                   |

The type of reference range is specified in the `qualifiedInterval.category` field.

<details>
  <summary>Example</summary>
  <MedplumCodeBlock language="ts" selectBlocks="categories">
    {ExampleCode}
  </MedplumCodeBlock>
</details>

## Editing reference ranges in the Medplum App

Medplum has developed user interface tools to simplify the process of editing [`ObservationDefinition`](/docs/api/fhir/resources/observationdefinition) reference ranges.
The [ReferenceRangeEditor](https://storybook.medplum.com/?path=/story/medplum-referencerangeeditor--empty) component enables you to define groups of reference ranges for each set of patient attributes.

You can integrate this component into your custom application, or you can use it directly within the Medplum App.

To edit reference ranges in the Medplum App:

1. Navigate to the Medplum App's ObservationDefinition page at https://app.medplum.com/ObservationDefinition.
2. Select the specific [`ObservationDefinition`](/docs/api/fhir/resources/observationdefinition) resource you wish to edit.
3. Click on the "Ranges" tab.

### Examples

- [HDL Reference Ranges](https://storybook.medplum.com/?path=/story/medplum-referencerangeeditor--hdl) - no dependence on patient attributes.
- [Testosterone Reference Ranges](https://storybook.medplum.com/?path=/story/medplum-referencerangeeditor--testosterone) - dependent on patient gender and age.

## Non-numeric reference ranges

For qualitative observations, defining interpretations in the [`ObservationDefinition`](/docs/api/fhir/resources/observationdefinition) is slightly different. Rather than defining numerical ranges, the administrator defines [`ValueSet`](/docs/api/fhir/resources/valueset) resources that enumerate sets of codes.

The `validCodedValueSet`, `normalCodedValueSet`, `abnormalCodedValueSet`, and `criticalCodedValueSet` fields mirror the functionality of `absolute`, `reference`, and `critical` reference ranges, are used to define the interpretation of a qualitative observation.

Each one of these fields refers to a [`ValueSet`](/docs/api/fhir/resources/valueset) resource, which enumerates the codes assigned to each category of interpretation.

Sure, I can convert those into a table for you:

| Field Name              | Similar to  | Description                                                                                                                                   |
| ----------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `validCodedValueSet`    | `absolute`  | Enumerates of _all_ valid qualitative values for this Observation type.                                                                       |
| `normalCodedValueSet`   | `reference` | Enumerates all codes that signify a _normal_ result for this Observation. It should be a subset of the `validCodedValueSet`.                  |
| `abnormalCodedValueSet` | `reference` | Enumerates all of codes that signify an _abnormal_ result for this Observation. It should be a subset of the `validCodedValueSet`.            |
| `criticalCodedValueSet` | `critical`  | Enumerates all the qualitative values that are considered _critical_ or cause for "panic". Typically a subset of the `abnormalCodedValueSet`. |

## See Also

- [Loinc Guide](./loinc)
- Diagnostic Catalog

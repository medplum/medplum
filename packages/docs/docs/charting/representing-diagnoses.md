import ExampleCode from '!!raw-loader!@site/../examples/src/charting/representing-diagnoses.ts';
import MedplumCodeBlock from '@site/src/components/MedplumCodeBlock';

# Representing Diagnoses

Representing diagnoses accurately is crucial for all healthcare systems. There are generally two types of diagnoses:

- Encounter Diagnoses
- Problem List Items

To capture these, along with other patient problems and concerns, FHIR provides the [`Condition`](/docs/api/fhir/resources/condition) resource. Some applications of the [`Condition`](/docs/api/fhir/resources/condition) resource include:

- Social Determinants of Health (SDOH)
- Chronic Conditions
- Substance Use/Abuse
- Mental/Cognitive Impairment
- Physical Disability/Impairment

## Ongoing Medical Conditions

The [`Condition`](/docs/api/fhir/resources/condition) resource provides a detailed record of any ongoing conditions or problems that a [`Patient`](/docs/api/fhir/resources/patient) may have, as well as metadata to provide context about the condition. This context includes the type, onset/resolution date, severity, progression, and verification status of the [`Condition`](/docs/api/fhir/resources/condition).

It is important to note that a [`Condition`](/docs/api/fhir/resources/condition) resource represents an _instance_ of a diagnosis. For example, if a patient has a condition, then recovers from it, and then it recurs, the recurrence would be a separate [`Condition`](/docs/api/fhir/resources/condition). The fact that it is a recurrence can be noted using the `clinicalStatus` field.

| **Element**          | **Description**                                                                                                                                                                                             | **Code System**                                                                                       | **Example**                                               |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `code`               | A code identifying what the condition or problem is.                                                                                                                                                        | [ICD-10](https://www.cms.gov/medicare/coding-billing/icd-10-codes), [SNOMED](https://www.snomed.org/) | C46.50 - Kaposi's sarcoma of unspecified lung             |
| `category`           | A category assigned to the condition. [See below.](#types-of-diagnoses)                                                                                                                                     | [Condition Category Codes](https://build.fhir.org/valueset-condition-category.html)                   | `problem-list-item` or `encounter-diagnosis`              |
| `clinicalStatus`     | The current clinical status of the condition. i.e., whether it is recurring, active, etc.                                                                                                                   | [Condition Clinical Status Codes](https://build.fhir.org/valueset-condition-clinical.html)            | active                                                    |
| `verificationStatus` | The verification of the condition. For example, could indicate if a patient has claimed they have a condition that has not yet been verified by a physician.                                                | [Condition Verification Status Codes](https://build.fhir.org/valueset-condition-ver-status.html)      | provisional                                               |
| `severity`           | A subjective measure of the severity of the condition.                                                                                                                                                      | [Condition/Diagnosis Severity Codes](https://build.fhir.org/valueset-condition-severity.html)         | Severe                                                    |
| `subject`            | The patient that has the condition.                                                                                                                                                                         |                                                                                                       | Patient/homer-simpson                                     |
| `onset[x]`           | The date or time that the condition began. Can be a `dateTime`, [`Age`](/docs/api/fhir/datatypes/age), [`Period`](/docs/api/fhir/datatypes/period), [`Range`](/docs/api/fhir/datatypes/range), or `string`. |                                                                                                       | 2024-01-04                                                |
| `abatement[x]`       | The date or time that the condition ended. Can be a `dateTime`, [`Age`](/docs/api/fhir/datatypes/age), [`Period`](/docs/api/fhir/datatypes/period), [`Range`](/docs/api/fhir/datatypes/range), or `string`. |                                                                                                       | 2024-01-11                                                |
| `recordedDate`       | When the condition was recorded and entered into the system. This is often system-generated.                                                                                                                |                                                                                                       | Fri Jan 12 2024 09:45:28 GMT-0500 (Eastern Standard Time) |
| `stage`              | A summary of the stage of the condition. This is specific to the condition, and many will not have a stage.                                                                                                 |                                                                                                       | Stage 3                                                   |
| `evidence`           | Supporting evidence that provides the basis for determining the condition. This can include references to other resources, such as [`Observations`](/docs/api/fhir/resources/observation).                  |                                                                                                       | Observation/collapsed-lung                                |
| `note`               | Any additional notes about the condition.                                                                                                                                                                   |                                                                                                       | The patient has a family history of cancer.               |

<details>
  <summary>Example Condition</summary>
  <MedplumCodeBlock language="ts" selectBlocks="sampleCondition">
    {ExampleCode}
  </MedplumCodeBlock>
</details>

<details>
  <summary>Example ValueSet of Condition Codes</summary>
  <MedplumCodeBlock language="ts" selectBlocks="sampleValueSet">
    {ExampleCode}
  </MedplumCodeBlock>
</details>

### Additional Use Cases

In addition to representing diagnoses, the [`Condition`](/docs/api/fhir/resources/condition) resource also has some other uses that should be noted.

The [`Condition`](/docs/api/fhir/resources/condition) resource should not be used when recording allergies. Instead, FHIR provides the more specific [`AllergyIntolerance`](/docs/api/fhir/resources/allergyintolerance) resource.

Additionally, the [`Condition`](/docs/api/fhir/resources/condition) resource can also be used to record social factors. For example, if a patient is unemployed or living in poverty, that can be recorded as a [`Condition`](/docs/api/fhir/resources/condition).

## Types of Diagnoses

As mentioned earlier, the [`Condition`](/docs/api/fhir/resources/condition) resource can be used to represent two types of diagnoses:

1. Encounter Diagnoses
2. Problem List Items

### Encounter Diagnosis

A [`Condition`](/docs/api/fhir/resources) with type `encounter-diagnosis` represents the outcome of a specific visit or interaction with between a [`Patient`](/docs/api/fhir/resources/patient) and a [`Practitioner`](/docs/api/fhir/resources).

To model an encounter diagnosis, the `Condition.category` field must be set to `encounter-diagnosis`. Additionally, the `Condition.encounter` should link to the [`Encounter`](/docs/api/fhir/resources/encounter) resource during which the diagnosis was made.

The [US Core implementation of encounter diagnoses](https://hl7.org/fhir/us/core/STU5.0.1/StructureDefinition-us-core-condition-encounter-diagnosis.html) provides further guidelines on how they should be modeled.

### Problem List Item

To provide clinicians with an accurate [`Patient`](/docs/api/fhir/resources/patient) history across visits, most EHRs provide a 'problem list' of the [`Patient's`](/docs/api/fhir/resources/patient) active conditions. Each issue on the list is represented by a [`Condition`](/docs/api/fhir/resources/condition) with a `category` code of `problem-list-item`.

When implementing a problem list in your system, it is a best practice to keep separate [`Condition`](/docs/api/fhir/resources/condition) resources for Encounter Diagnoses and Problem List Items. This allows for easy tracking of the [`Condition`](/docs/api/fhir/resources/condition) as it changes over time using the Problem List version, while also having a record of the original diagnosis in the Encounter Diagnosis version.

Clinicians should exercise judgement on when to add something to the problem list, and most systems require them to take an explicit action to promote an Encounter Diagnosis to a Problem List Item.

## Symptoms vs. Conditions

Recording symptoms and differentiating them from long-term problems can be difficult in FHIR, so it is important to clarify when an [`Observation`](/docs/api/fhir/resources/observation) and a [`Condition`](/docs/api/fhir/resources/condition) should be used. At a high level, an [`Observation`](/docs/api/fhir/resources/observation) represents a a _point-in-time_ measurement and a [`Condition`](/docs/api/fhir/resources/condition) represents an _ongoing_ problem or diagnosis.

The [`Observation`](/docs/api/fhir/resources/observation) resource should be used for symptoms that can be resolved without long-term management. Additionally, an [`Observation`](/docs/api/fhir/resources/observation) often contributes to the establishment of a [`Condition`](/docs/api/fhir/resources/condition). For example, there may be an [`Observation`](/docs/api/fhir/resources/observation) of high blood pressure that leads to a [`Condition`](/docs/api/fhir/resources/condition) to track and manage that high blood pressure. For more details on the [`Observation`](/docs/api/fhir/resources/observation) resource, see the [Capturing Vital Signs docs](/docs/charting/capturing-vital-signs).

A [`Condition`](/docs/api/fhir/resources/condition) should be used for symptoms that require long-term management or as a proxy for a diagnosis. Additionally, it can be used in some cases when a symptom that might otherwise be an [`Observation`](/docs/api/fhir/resources/observation) persists over a longer period. For example, a fever measured at a given time may be an [`Observation`](/docs/api/fhir/resources/observation), but if it persists for multiple days, it would become a [`Condition`](/docs/api/fhir/resources/condition) to track and manage.

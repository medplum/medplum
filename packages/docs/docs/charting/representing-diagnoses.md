import ExampleCode from '!!raw-loader!@site/../examples/src/charting/representing-diagnoses.ts';
import MedplumCodeBlock from '@site/src/components/MedplumCodeBlock';

# Representing Diagnoses

Representing diagnoses accurately and with detail is crucial for all healthcare systems. It allows for efficient decision making to provide top of the line patient care.

To capture diagnoses, along with other patient problems and concerns, FHIR provides the [`Condition`](/docs/api/fhir/resources/condition) resource.

## Ongoing Medical Conditions

The [`Condition`](/docs/api/fhir/resources/condition) resource provides a detailed record of any ongoing conditions, problems, or symptoms that a [`Patient`](/docs/api/fhir/resources/patient) may have, as well as metadata to provide context about the condition. It acts as a proxy for a diagnosis.

It is important to note that a [`Condition`](/docs/api/fhir/resources/condition) resource represents an _instance_ of a diagnosis. For example, if a patient has a condition, then recovers from it, and then it recurs, the recurrence would be a separate [`Condition`](/docs/api/fhir/resources/condition). The fact that it is a recurrence can be noted using the `clinicalStatus` field.

| **Element**          | **Description**                                                                                                                                                                                             | **Code System**                                                                                       | **Example**                                                                                                                                          |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `code`               | A code identifying what the condition or problem is.                                                                                                                                                        | [ICD-10](https://www.cms.gov/medicare/coding-billing/icd-10-codes), [SNOMED](https://www.snomed.org/) | Kaposi's sarcoma of right lung                                                                                                                       |
| `clinicalStatus`     | The current clinical status of the condition. i.e., whether it is recurring, active, etc.                                                                                                                   | [Condition Clinical Status Codes](https://build.fhir.org/valueset-condition-clinical.html)            | active                                                                                                                                               |
| `verificationStatus` | The verification of the condition. For example, could indicate if a patient has claimed they have a condition that has not yet been verified by a physician.                                                | [Condition Verification Status Codes](https://build.fhir.org/valueset-condition-ver-status.html)      | provisional                                                                                                                                          |
| `category`           | A category assigned to the condition.                                                                                                                                                                       | [Condition Category Codes](https://build.fhir.org/valueset-condition-category.html)                   | problem-list-item                                                                                                                                    |
| `severity`           | A subjective measure of the severity of the condition.                                                                                                                                                      | [Condition/Diagnosis Severity Codes](https://build.fhir.org/valueset-condition-severity.html)         | Severe                                                                                                                                               |
| `subject`            | The patient that has the condition.                                                                                                                                                                         |                                                                                                       | Patient/homer-simpson                                                                                                                                |
| `bodySite`           | The anatomical location where the condition occurs.                                                                                                                                                         | [SNOMED](https://www.snomed.org/)                                                                     | [3341006](https://browser.ihtsdotools.org/?perspective=full&conceptId1=3341006&edition=MAIN/2024-01-01&release=&languages=en) - Right lung structure |
| `onset[x]`           | The date or time that the condition began. Can be a `dateTime`, [`Age`](/docs/api/fhir/datatypes/age), [`Period`](/docs/api/fhir/datatypes/period), [`Range`](/docs/api/fhir/datatypes/range), or `string`. |                                                                                                       | 2024-01-04                                                                                                                                           |
| `abatement[x]`       | The date or time that the condition ended. Can be a `dateTime`, [`Age`](/docs/api/fhir/datatypes/age), [`Period`](/docs/api/fhir/datatypes/period), [`Range`](/docs/api/fhir/datatypes/range), or `string`. |                                                                                                       | 2024-01-11                                                                                                                                           |
| `recordedDate`       | When the condition was recorded and entered into the system. This is often system-generated.                                                                                                                |                                                                                                       | Fri Jan 12 2024 09:45:28 GMT-0500 (Eastern Standard Time)                                                                                            |
| `stage`              | A summary of the stage of the condition. This is specific to the condition, and many will not have a stage.                                                                                                 |                                                                                                       | Stage 3                                                                                                                                              |
| `evidence`           | Supporting evidence that provides the basis for determining the condition. This can include references to other resources, such as [`Observations`](/docs/api/fhir/resources/observation).                  |                                                                                                       | Observation/collapsed-lung                                                                                                                           |
| `note`               | Any additional notes about the condition.                                                                                                                                                                   |                                                                                                       | The patient has a family history of cancer.                                                                                                          |

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

First, the [`Condition`](/docs/api/fhir/resources/condition) resource is not solely used to represent patient problems or negative outcomes. It can also represent the general health state of a patient. For example, if a patient is pregnant, that would be tracked and managed using a [`Condition`](/docs/api/fhir/resources/condition).

Second, the [`Condition`](/docs/api/fhir/resources/condition) resource should not be used when recording allergies. Instead, FHIR provides the more specific [`AllergyIntolerance`](/docs/api/fhir/resources/allergyintolerance) resource.

Finally, the [`Condition`](/docs/api/fhir/resources/condition) resource can also be used to record social factors. For example, if a patient is unemployed or living in poverty, that can be recorded as a [`Condition`](/docs/api/fhir/resources/condition).

## Recording Symptoms

Recording symptoms and differentiating them from long-term problems can be difficult in FHIR, so it is important to clarify when an [`Observation`](/docs/api/fhir/resources/observation) and a [`Condition`](/docs/api/fhir/resources/condition) should be used. At a high level, an [`Observation`](/docs/api/fhir/resources/observation) represents a a point-in-time measurement and a [`Condition`](/docs/api/fhir/resources/condition) represents an ongoing problem or diagnosis.

The [`Observation`](/docs/api/fhir/resources/observation) resource should be used for symptoms that can be resolved without long-term management. Additionally, an [`Observation`](/docs/api/fhir/resources/observation) often contributes to the establishment of a [`Condition`](/docs/api/fhir/resources/condition). For example, there may be an [`Observation`](/docs/api/fhir/resources/observation) of high blood pressure that leads to a [`Condition`](/docs/api/fhir/resources/condition) to track and manage that high blood pressure. For more details on the [`Observation`](/docs/api/fhir/resources/observation) resource, see the [Capturing Vital Signs docs](/docs/charting/capturing-vital-signs).

A [`Condition`](/docs/api/fhir/resources/condition) should be used for symptoms that require long-term management or as a proxy for a diagnosis. Additionally, it can be used in some cases when a symptom that might otherwise be an [`Observation`](/docs/api/fhir/resources/observation) persists over a longer period. For example, a fever measured at a given time may be an [`Observation`](/docs/api/fhir/resources/observation), but if it persists for multiple days, it would become a [`Condition`](/docs/api/fhir/resources/condition) to track and manage.

## Tracking Diagnoses

A common pattern in healthcare is a “Problem List” for a given patient. This is used to keep track of all the current and historical diagnoses that may impact the current health of the patient.

To link a [`Condition`](/docs/api/fhir/resources/condition) to a [`Patient`](/docs/api/fhir/resources/patient), the [`Patient`](/docs/api/fhir/resources/patient) should be referenced in the `subject` field.

Additionally, you can create a Problem List using the [`List`](/docs/api/fhir/resources/list) resource for the [`Patient`](/docs/api/fhir/resources/patient) and adding all their [`Condition`](/docs/api/fhir/resources/condition) resources. This will keep all relevant [`Conditions`](/docs/api/fhir/resources/condition) localized in one place. This also makes it easy to represent

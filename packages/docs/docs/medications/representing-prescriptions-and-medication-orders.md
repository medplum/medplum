import MedplumCodeBlock from '@site/src/components/MedplumCodeBlock';
import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

import ExampleCode from '!!raw-loader!@site/..//examples/src/medications/representing-prescriptions-and-medication-orders.ts';

# Representing Prescriptions and Medication Orders

Prescriptions and medication orders are very common in healthcare settings and accuracy is vitally important. This guide will go over how to represent all aspects of a medication order, from the request to the administration instructions. Note that this is an _operational counterpart_ to the [Modeling A Formulary](https://www.medplum.com/docs/medications/formulary) documentation.

## The `MedicationRequest` Resource

Medical orders should be represented in FHIR using the `MedicationRequest` resource. This resource represents the request for the supply of medication as well as the instructions for administration to the patient.

| Element                     | Description                                                                                                                                             | Example                                          |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `status`                    | The current state of the order (i.e. completed, active, etc.)                                                                                           | completed                                        |
| `medicationCodeableConcept` | The medication being requested, coded as a concept. The details of the drug will be in the `MedicationKnowledge` resource with the same code.           | 42844 - Percocet                                 |
| `medicationReference`       | A reference to the specific `Medication` resource that is being requested.                                                                              | Medication/percocet                              |
| `subject`                   | The patient or group who the medication or prescription is for.                                                                                         | Patient/homer-simpson                            |
| `requester`                 | The practitioner who created the request or wrote the prescription.                                                                                     | Practitioner/dr-alice-smith                      |
| `encounter`                 | The medical appointment at which the request was created.                                                                                               | Encounter/homer-simpson-annual-physical          |
| `dosageInstructions`        | Instructions on how the medication should be used by the patient.                                                                                       | [See below](#representing-patient-instructions)  |
| `dispenseRequest`           | Provides details about how the medication should be dispensed or supplied, including quantity, refills, and more.                                       | [See below](#representing-dispense-instructions) |
| `substitution`              | A boolean value, indicating whether a substitution can or should be a part of the dispense. If it is blank, it implies that a substitution may be done. | false                                            |
| `priorPrescription`         | A reference to a previous prescription or order that this one is replacing or updating.                                                                 | MedicationRequest/homer-simpson-percocet-1       |
| `reasonReference`           | A reference to a `Condition` or `Observation` that indicates why the order was made.                                                                    | Condition/chronic-pain                           |
| `category`                  | The type of medical request (i.e. inpatient or outpatient).                                                                                             | outpatient                                       |
| `priority`                  | How quickly the request should be addressed.                                                                                                            | urgent                                           |

It is important to note that a `MedicationRequest` resource does not have detailed information on the drug that is being prescribed or ordered. Instead, this information will be in the related `MedicationKnowledge` resource with the same code. This code should be stored in the `medicationCodeableConcept` field of the `MedicationRequest`, establishing a link between the request and the details of the drug. For more details on how to model medications, see the [Modeling a Formulary docs](https://www.medplum.com/docs/medications/formulary).

## Representing Dispense Instructions

The instructions on how the order should be dispensed should be included on the `MedicationRequest.dispenseRequest` field. This field is specifically built for this and is represented as a `MedicationRequestDispenseRequest` type.

| Element                  | Description                                                                                                                                                                                            |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `initialFill`            | The duration or quantity of the first dispense of the medication.                                                                                                                                      |
| `dispenseInterval`       | The minimum amount of time between refills of the medication.                                                                                                                                          |
| `validityPeriod`         | The period over which the prescription or order remains valid.                                                                                                                                         |
| `numberOfRepeatsAllowed` | The number of times that the order may be refilled. Note that this does not include the intial dispense. If the value here is 3, the order can be refilled 3 times in addition to the intial dispense. |
| `quantity`               | The amount of the medication that is to be dispensed for one fill.                                                                                                                                     |
| `expectedSupplyDuration` | The time period over which the medication is supposed to be used or which the prescription should last.                                                                                                |
| `performer`              | The organization (i.e. Pharmacy) that should dispense the medication.                                                                                                                                  |

<details><summary>Example: Dispense Instructions</summary>
  <MedplumCodeBlock language="ts" selectBlocks="dispenseInstructions">
    {ExampleCode}
  </MedplumCodeBlock>
</details>

## Representing Patient Instructions

The instructions for how the patient should take the medication should be included on the `MedicationRequest.dosageInstruction` field. This element includes fields to explain how, how often, and when the medication should be taken and is represented with a `Dosage` type.

| Element                    | Description                                                                                            |
| -------------------------- | ------------------------------------------------------------------------------------------------------ |
| `sequence`                 | The specific step in which this dosage should be taken. It should start at 1 and increment from there. |
| `additionalInstruction`    | Any additional directions to the patient for taking the medicine (e.g. with a meal, or before eating). |
| `patientInstruction`       | Readable instructions that the patient is able to understand.                                          |
| `timing`                   | When the medication should be administered, including how often it should be repeated.                 |
| `asNeededBoolean`          | Whether the medication should be taken as needed by the patient.                                       |
| `site`                     | The body site the medication should be administered to.                                                |
| `route`                    | The route that the body should enter the body (e.g. orally, intravenously, etc.).                      |
| `method`                   | The technique that should be used to administer the medication (e.g. swallowed, injected, etc.).       |
| `doseAndRate`              | The amount and frequency of medication to be administered.                                             |
| `maxDosePerPeriod`         | The limit to the amount of medication that should be administed over a given period.                   |
| `maxDosePerAdministration` | The limit to the amount of medication that should be taken in a single administration.                 |
| `maxDosePerLifetime`       | The limit to the amount of medication that should be taken by a patient in their lifetime.             |

Note that this field is stored as an array, so there can be multiple dosage instructions for each order. For example, the same medication may be taken multiple times throughout the day, but in different dosages each time. This is where the `dosageInstruction.sequence` field should be used to indicate which order the instructions are in.

<details><summary>Example: Dosage Instructions</summary>
  <MedplumCodeBlock language="ts" selectBlocks="dosageInstructions">
    {ExampleCode}
  </MedplumCodeBlock>
</details>

## Distinguishing Between Prescriptions and Medication Orders

A `MedicationRequest` can represent both a prescription and a medication order, so it is important to be able to distinguish between these. A prescription is an order for medication in an outpatient context, while a medication order represents medication that will be administered in an inpatient context.

These types of requests should be differentiated as outpatient vs. inpatient using the `MedicationRequest.category` field, which represents the type of medical request. The [FHIR MedicationRequest Admin Location value set](https://www.hl7.org/fhir/valueset-medicationrequest-admin-location.html) can be used for this. Note that the `category` field is an array, so it is possible to have multiple values if you wish to categorize your requests in other ways as well.

<details><summary>Example: A MedicationRequest categorized for a prescription</summary>
  <MedplumCodeBlock language="ts" selectBlocks="prescriptionRequest">
    {ExampleCode}
  </MedplumCodeBlock>
</details>

<details><summary>Example: A MedicationRequest categorized for a prescription</summary>
  <MedplumCodeBlock language="ts" selectBlocks="orderRequest">
    {ExampleCode}
  </MedplumCodeBlock>
</details>

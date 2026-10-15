For Medplum best practices on using the `MedicationDispense` resource, please refer to [Representing Prescriptions and Medication Orders](https://www.medplum.com/docs/medications/representing-prescriptions-and-medication-orders).

## Usage

This resource covers the supply of medications to a patient. Examples include dispensing and pick-up from an outpatient or community pharmacy, dispensing patient-specific medications from inpatient pharmacy to ward, as well as issuing a single dose from ward stock to a patient for consumption. The medication dispense is the result of a pharmacy system responding to a medication order.

MedicationDispense is an event resource from a FHIR workflow perspective - see [Workflow Event](https://www.hl7.org/fhir/workflow.html#event)

## Relationships

**The [Medication](/docs/api/fhir/resources/medication) domain includes a number of related resources**

<table border="1" cellpadding="1" cellspacing="2" frame="box"><tbody><tr><td><a href="/docs/api/fhir/resources/medicationrequest">MedicationRequest</a></td><td>An order for both supply of the medication and the instructions for administration of the medicine to a patient.</td></tr><tr><td><a href="/docs/api/fhir/resources/medicationdispense">MedicationDispense</a></td><td>Provision of a supply of a medication with the intention that it is subsequently consumed by a patient (usually in response to a prescription).</td></tr><tr><td><a href="/docs/api/fhir/resources/medicationadministration">MedicationAdministration</a></td><td>When a patient actually consumes a medicine, or the medication is otherwise administered to them</td></tr><tr><td><a href="/docs/api/fhir/resources/medicationstatement">MedicationStatement</a></td><td>This is a record of a medication being taken by a patient or that a medication has been given to a patient, where the record is the result of a report from the patient or another clinician. A medication statement is not a part of the prescribe-&gt;dispense-&gt;administer sequence but is a report that such a sequence (or at least a part of it) did take place, resulting in a belief that the patient has received a particular medication.</td></tr></tbody></table>

This resource does not deal with the supply or transfer of non-medication related items to a patient.

## Background and Context

The supply and the associated administration instructions might not exactly follow the original order (prescription), either because some details were left for completion at this point in the process or because the dispenser exercised their clinical judgment to make some appropriate modification.

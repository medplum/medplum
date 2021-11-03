---
title: MedicationStatement
sidebar_position: 399
---

# MedicationStatement

A record of a medication that is being consumed by a patient.   A MedicationStatement may indicate that the patient may
  be taking the medication now or has taken the medication in the past or will be taking the medication in the future.
  The source of this information can be the patient, significant other (such as a family member or spouse), or a
  clinician.  A common scenario where this information is captured is during the history taking process during a patient
  visit or stay.   The medication information may come from sources such as the patient's memory, from a prescription
  bottle,  or from a list of medications the patient, clinician or other party maintains. 

The primary difference between
  a medication statement and a medication administration is that the medication administration has complete administration
  information and is based on actual administration information from the person who administered the medication.  A
  medication statement is often, if not always, less specific.  There is no required date/time when the medication was
  administered, in fact we only know that a source has reported the patient is taking this medication, where details such
  as time, quantity, or rate or even medication product may be incomplete or missing or less precise.  As stated earlier,
  the medication statement information may come from the patient's memory, from a prescription bottle or from a list of
  medications the patient, clinician or other party maintains.  Medication administration is more formal and is not
  missing detailed information.

## Properties

| Name | Card | Type | Description |
| --- | --- | --- | --- |
| id | 0..1 | string | Logical id of this artifact
| meta | 0..1 | Meta | Metadata about the resource
| implicitRules | 0..1 | uri | A set of rules under which this content was created
| language | 0..1 | code | Language of the resource content
| text | 0..1 | Narrative | Text summary of the resource, for human interpretation
| contained | 0..* | Resource | Contained, inline Resources
| extension | 0..* | Extension | Additional content defined by implementations
| modifierExtension | 0..* | Extension | Extensions that cannot be ignored
| identifier | 0..* | Identifier | External identifier
| basedOn | 0..* | Reference | Fulfils plan, proposal or order
| partOf | 0..* | Reference | Part of referenced event
| status | 1..1 | code | active \| completed \| entered-in-error \| intended \| stopped \| on-hold \| unknown \| not-taken
| statusReason | 0..* | CodeableConcept | Reason for current status
| category | 0..1 | CodeableConcept | Type of medication usage
| medication[x] | 1..1 | CodeableConcept | What medication was taken
| subject | 1..1 | Reference | Who is/was taking  the medication
| context | 0..1 | Reference | Encounter / Episode associated with MedicationStatement
| effective[x] | 0..1 | dateTime | The date/time or interval when the medication is/was/will be taken
| dateAsserted | 0..1 | dateTime | When the statement was asserted?
| informationSource | 0..1 | Reference | Person or organization that provided the information about the taking of this medication
| derivedFrom | 0..* | Reference | Additional supporting information
| reasonCode | 0..* | CodeableConcept | Reason for why the medication is being/was taken
| reasonReference | 0..* | Reference | Condition or observation that supports why the medication is being/was taken
| note | 0..* | Annotation | Further information about the statement
| dosage | 0..* | Dosage | Details of how medication is/was taken or should be taken

## Search Parameters

| Name | Type | Description | Expression
| --- | --- | --- | --- |
| code | token | Return statements of this medication code | MedicationStatement.medication
| identifier | token | Return statements with this external identifier | MedicationStatement.identifier
| patient | reference | Returns statements for a specific patient. | MedicationStatement.subject
| medication | reference | Return statements of this medication reference | MedicationStatement.medication
| status | token | Return statements that match the given status | MedicationStatement.status
| category | token | Returns statements of this category of medicationstatement | MedicationStatement.category
| context | reference | Returns statements for a specific context (episode or episode of Care). | MedicationStatement.context
| effective | date | Date when patient was taking (or not taking) the medication | MedicationStatement.effective
| part-of | reference | Returns statements that are part of another event. | MedicationStatement.partOf
| source | reference | Who or where the information in the statement came from | MedicationStatement.informationSource
| subject | reference | The identity of a patient, animal or group to list statements for | MedicationStatement.subject


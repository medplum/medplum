---
title: MedicationAdministration
sidebar_position: 372
---

# MedicationAdministration

Describes the event of a patient consuming or otherwise being administered a medication.  This may be as simple as
  swallowing a tablet or it may be a long running infusion.  Related resources tie this event to the authorizing
  prescription, and the specific encounter between patient and health care practitioner.

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
| instantiates | 0..* | uri | Instantiates protocol or definition
| partOf | 0..* | Reference | Part of referenced event
| status | 1..1 | code | in-progress \| not-done \| on-hold \| completed \| entered-in-error \| stopped \| unknown
| statusReason | 0..* | CodeableConcept | Reason administration not performed
| category | 0..1 | CodeableConcept | Type of medication usage
| medication[x] | 1..1 | CodeableConcept | What was administered
| subject | 1..1 | Reference | Who received medication
| context | 0..1 | Reference | Encounter or Episode of Care administered as part of
| supportingInformation | 0..* | Reference | Additional information to support administration
| effective[x] | 1..1 | dateTime | Start and end time of administration
| performer | 0..* | BackboneElement | Who performed the medication administration and what they did
| reasonCode | 0..* | CodeableConcept | Reason administration performed
| reasonReference | 0..* | Reference | Condition or observation that supports why the medication was administered
| request | 0..1 | Reference | Request administration performed against
| device | 0..* | Reference | Device used to administer
| note | 0..* | Annotation | Information about the administration
| dosage | 0..1 | BackboneElement | Details of how medication was taken
| eventHistory | 0..* | Reference | A list of events of interest in the lifecycle

## Search Parameters

| Name | Type | Description | Expression
| --- | --- | --- | --- |
| code | token | Return administrations of this medication code | MedicationAdministration.medication
| identifier | token | Return administrations with this external identifier | MedicationAdministration.identifier
| patient | reference | The identity of a patient to list administrations  for | MedicationAdministration.subject
| context | reference | Return administrations that share this encounter or episode of care | MedicationAdministration.context
| device | reference | Return administrations with this administration device identity | MedicationAdministration.device
| effective-time | date | Date administration happened (or did not happen) | MedicationAdministration.effective
| medication | reference | Return administrations of this medication resource | MedicationAdministration.medication
| performer | reference | The identity of the individual who administered the medication | MedicationAdministration.performer.actor
| reason-given | token | Reasons for administering the medication | MedicationAdministration.reasonCode
| reason-not-given | token | Reasons for not administering the medication | MedicationAdministration.statusReason
| request | reference | The identity of a request to list administrations from | MedicationAdministration.request
| status | token | MedicationAdministration event status (for example one of active/paused/completed/nullified) | MedicationAdministration.status
| subject | reference | The identity of the individual or group to list administrations for | MedicationAdministration.subject


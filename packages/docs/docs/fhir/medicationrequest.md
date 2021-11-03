---
title: MedicationRequest
sidebar_position: 395
---

# MedicationRequest

An order or request for both supply of the medication and the instructions for administration of the medication to a
  patient. The resource is called "MedicationRequest" rather than "MedicationPrescription" or "MedicationOrder" to
  generalize the use across inpatient and outpatient settings, including care plans, etc., and to harmonize with workflow
  patterns.

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
| identifier | 0..* | Identifier | External ids for this request
| status | 1..1 | code | active \| on-hold \| cancelled \| completed \| entered-in-error \| stopped \| draft \| unknown
| statusReason | 0..1 | CodeableConcept | Reason for current status
| intent | 1..1 | code | proposal \| plan \| order \| original-order \| reflex-order \| filler-order \| instance-order \| option
| category | 0..* | CodeableConcept | Type of medication usage
| priority | 0..1 | code | routine \| urgent \| asap \| stat
| doNotPerform | 0..1 | boolean | True if request is prohibiting action
| reported[x] | 0..1 | boolean | Reported rather than primary record
| medication[x] | 1..1 | CodeableConcept | Medication to be taken
| subject | 1..1 | Reference | Who or group medication request is for
| encounter | 0..1 | Reference | Encounter created as part of encounter/admission/stay
| supportingInformation | 0..* | Reference | Information to support ordering of the medication
| authoredOn | 0..1 | dateTime | When request was initially authored
| requester | 0..1 | Reference | Who/What requested the Request
| performer | 0..1 | Reference | Intended performer of administration
| performerType | 0..1 | CodeableConcept | Desired kind of performer of the medication administration
| recorder | 0..1 | Reference | Person who entered the request
| reasonCode | 0..* | CodeableConcept | Reason or indication for ordering or not ordering the medication
| reasonReference | 0..* | Reference | Condition or observation that supports why the prescription is being written
| instantiatesCanonical | 0..* | canonical | Instantiates FHIR protocol or definition
| instantiatesUri | 0..* | uri | Instantiates external protocol or definition
| basedOn | 0..* | Reference | What request fulfills
| groupIdentifier | 0..1 | Identifier | Composite request this is part of
| courseOfTherapyType | 0..1 | CodeableConcept | Overall pattern of medication administration
| insurance | 0..* | Reference | Associated insurance coverage
| note | 0..* | Annotation | Information about the prescription
| dosageInstruction | 0..* | Dosage | How the medication should be taken
| dispenseRequest | 0..1 | BackboneElement | Medication supply authorization
| substitution | 0..1 | BackboneElement | Any restrictions on medication substitution
| priorPrescription | 0..1 | Reference | An order/prescription that is being replaced
| detectedIssue | 0..* | Reference | Clinical Issue with action
| eventHistory | 0..* | Reference | A list of events of interest in the lifecycle

## Search Parameters

| Name | Type | Description | Expression
| --- | --- | --- | --- |
| code | token | Return prescriptions of this medication code | MedicationRequest.medication
| identifier | token | Return prescriptions with this external identifier | MedicationRequest.identifier
| patient | reference | Returns prescriptions for a specific patient | MedicationRequest.subject
| medication | reference | Return prescriptions for this medication reference | MedicationRequest.medication
| status | token | Status of the prescription | MedicationRequest.status
| authoredon | date | Return prescriptions written on this date | MedicationRequest.authoredOn
| category | token | Returns prescriptions with different categories | MedicationRequest.category
| date | date | Returns medication request to be administered on a specific date | MedicationRequest.dosageInstruction.timing.event
| encounter | reference | Return prescriptions with this encounter identifier | MedicationRequest.encounter
| intended-dispenser | reference | Returns prescriptions intended to be dispensed by this Organization | MedicationRequest.dispenseRequest.performer
| intended-performer | reference | Returns the intended performer of the administration of the medication request | MedicationRequest.performer
| intended-performertype | token | Returns requests for a specific type of performer | MedicationRequest.performerType
| intent | token | Returns prescriptions with different intents | MedicationRequest.intent
| priority | token | Returns prescriptions with different priorities | MedicationRequest.priority
| requester | reference | Returns prescriptions prescribed by this prescriber | MedicationRequest.requester
| subject | reference | The identity of a patient to list orders  for | MedicationRequest.subject


---
title: DeviceUseStatement
sidebar_position: 228
---

# DeviceUseStatement

A record of a device being used by a patient where the record is the result of a report from the patient or another clinician.

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
| identifier | 0..* | Identifier | External identifier for this record
| basedOn | 0..* | Reference | Fulfills plan, proposal or order
| status | 1..1 | code | active \| completed \| entered-in-error +
| subject | 1..1 | Reference | Patient using device
| derivedFrom | 0..* | Reference | Supporting information
| timing[x] | 0..1 | Timing | How often  the device was used
| recordedOn | 0..1 | dateTime | When statement was recorded
| source | 0..1 | Reference | Who made the statement
| device | 1..1 | Reference | Reference to device used
| reasonCode | 0..* | CodeableConcept | Why device was used
| reasonReference | 0..* | Reference | Why was DeviceUseStatement performed?
| bodySite | 0..1 | CodeableConcept | Target body site
| note | 0..* | Annotation | Addition details (comments, instructions)

## Search Parameters

| Name | Type | Description | Expression
| --- | --- | --- | --- |
| patient | reference | Search by subject - a patient | DeviceUseStatement.subject
| device | reference | Search by device | DeviceUseStatement.device
| identifier | token | Search by identifier | DeviceUseStatement.identifier
| subject | reference | Search by subject | DeviceUseStatement.subject


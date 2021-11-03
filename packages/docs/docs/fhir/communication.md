---
title: Communication
sidebar_position: 152
---

# Communication

An occurrence of information being transmitted; e.g. an alert that was sent to a responsible provider, a public health
  agency that was notified about a reportable condition.

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
| identifier | 0..* | Identifier | Unique identifier
| instantiatesCanonical | 0..* | canonical | Instantiates FHIR protocol or definition
| instantiatesUri | 0..* | uri | Instantiates external protocol or definition
| basedOn | 0..* | Reference | Request fulfilled by this communication
| partOf | 0..* | Reference | Part of this action
| inResponseTo | 0..* | Reference | Reply to
| status | 1..1 | code | preparation \| in-progress \| not-done \| on-hold \| stopped \| completed \| entered-in-error \| unknown
| statusReason | 0..1 | CodeableConcept | Reason for current status
| category | 0..* | CodeableConcept | Message category
| priority | 0..1 | code | routine \| urgent \| asap \| stat
| medium | 0..* | CodeableConcept | A channel of communication
| subject | 0..1 | Reference | Focus of message
| topic | 0..1 | CodeableConcept | Description of the purpose/content
| about | 0..* | Reference | Resources that pertain to this communication
| encounter | 0..1 | Reference | Encounter created as part of
| sent | 0..1 | dateTime | When sent
| received | 0..1 | dateTime | When received
| recipient | 0..* | Reference | Message recipient
| sender | 0..1 | Reference | Message sender
| reasonCode | 0..* | CodeableConcept | Indication for message
| reasonReference | 0..* | Reference | Why was communication done?
| payload | 0..* | BackboneElement | Message payload
| note | 0..* | Annotation | Comments made about the communication

## Search Parameters

| Name | Type | Description | Expression
| --- | --- | --- | --- |
| based-on | reference | Request fulfilled by this communication | Communication.basedOn
| category | token | Message category | Communication.category
| encounter | reference | Encounter created as part of | Communication.encounter
| identifier | token | Unique identifier | Communication.identifier
| instantiates-canonical | reference | Instantiates FHIR protocol or definition | Communication.instantiatesCanonical
| instantiates-uri | uri | Instantiates external protocol or definition | Communication.instantiatesUri
| medium | token | A channel of communication | Communication.medium
| part-of | reference | Part of this action | Communication.partOf
| patient | reference | Focus of message | Communication.subject
| received | date | When received | Communication.received
| recipient | reference | Message recipient | Communication.recipient
| sender | reference | Message sender | Communication.sender
| sent | date | When sent | Communication.sent
| status | token | preparation \| in-progress \| not-done \| on-hold \| stopped \| completed \| entered-in-error \| unknown | Communication.status
| subject | reference | Focus of message | Communication.subject


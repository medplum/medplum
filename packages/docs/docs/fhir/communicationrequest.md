---
title: CommunicationRequest
sidebar_position: 154
---

# CommunicationRequest

A request to convey information; e.g. the CDS system proposes that an alert be sent to a responsible provider, the CDS
  system proposes that the public health agency be notified about a reportable condition.

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
| basedOn | 0..* | Reference | Fulfills plan or proposal
| replaces | 0..* | Reference | Request(s) replaced by this request
| groupIdentifier | 0..1 | Identifier | Composite request this is part of
| status | 1..1 | code | draft \| active \| on-hold \| revoked \| completed \| entered-in-error \| unknown
| statusReason | 0..1 | CodeableConcept | Reason for current status
| category | 0..* | CodeableConcept | Message category
| priority | 0..1 | code | routine \| urgent \| asap \| stat
| doNotPerform | 0..1 | boolean | True if request is prohibiting action
| medium | 0..* | CodeableConcept | A channel of communication
| subject | 0..1 | Reference | Focus of message
| about | 0..* | Reference | Resources that pertain to this communication request
| encounter | 0..1 | Reference | Encounter created as part of
| payload | 0..* | BackboneElement | Message payload
| occurrence[x] | 0..1 | dateTime | When scheduled
| authoredOn | 0..1 | dateTime | When request transitioned to being actionable
| requester | 0..1 | Reference | Who/what is requesting service
| recipient | 0..* | Reference | Message recipient
| sender | 0..1 | Reference | Message sender
| reasonCode | 0..* | CodeableConcept | Why is communication needed?
| reasonReference | 0..* | Reference | Why is communication needed?
| note | 0..* | Annotation | Comments made about communication request

## Search Parameters

| Name | Type | Description | Expression
| --- | --- | --- | --- |
| authored | date | When request transitioned to being actionable | CommunicationRequest.authoredOn
| based-on | reference | Fulfills plan or proposal | CommunicationRequest.basedOn
| category | token | Message category | CommunicationRequest.category
| encounter | reference | Encounter created as part of | CommunicationRequest.encounter
| group-identifier | token | Composite request this is part of | CommunicationRequest.groupIdentifier
| identifier | token | Unique identifier | CommunicationRequest.identifier
| medium | token | A channel of communication | CommunicationRequest.medium
| occurrence | date | When scheduled | CommunicationRequest.occurrence
| patient | reference | Focus of message | CommunicationRequest.subject
| priority | token | routine \| urgent \| asap \| stat | CommunicationRequest.priority
| recipient | reference | Message recipient | CommunicationRequest.recipient
| replaces | reference | Request(s) replaced by this request | CommunicationRequest.replaces
| requester | reference | Who/what is requesting service | CommunicationRequest.requester
| sender | reference | Message sender | CommunicationRequest.sender
| status | token | draft \| active \| on-hold \| revoked \| completed \| entered-in-error \| unknown | CommunicationRequest.status
| subject | reference | Focus of message | CommunicationRequest.subject


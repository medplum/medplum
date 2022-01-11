---
title: DeviceRequest
sidebar_position: 226
---

# DeviceRequest

Represents a request for a patient to employ a medical device. The device may be an implantable device, or an external assistive device, such as a walker.

## Properties

| Name                  | Card  | Type            | Description                                                                                                          |
| --------------------- | ----- | --------------- | -------------------------------------------------------------------------------------------------------------------- |
| id                    | 0..1  | string          | Logical id of this artifact                                                                                          |
| meta                  | 0..1  | Meta            | Metadata about the resource                                                                                          |
| implicitRules         | 0..1  | uri             | A set of rules under which this content was created                                                                  |
| language              | 0..1  | code            | Language of the resource content                                                                                     |
| text                  | 0..1  | Narrative       | Text summary of the resource, for human interpretation                                                               |
| contained             | 0..\* | Resource        | Contained, inline Resources                                                                                          |
| extension             | 0..\* | Extension       | Additional content defined by implementations                                                                        |
| modifierExtension     | 0..\* | Extension       | Extensions that cannot be ignored                                                                                    |
| identifier            | 0..\* | Identifier      | External Request identifier                                                                                          |
| instantiatesCanonical | 0..\* | canonical       | Instantiates FHIR protocol or definition                                                                             |
| instantiatesUri       | 0..\* | uri             | Instantiates external protocol or definition                                                                         |
| basedOn               | 0..\* | Reference       | What request fulfills                                                                                                |
| priorRequest          | 0..\* | Reference       | What request replaces                                                                                                |
| groupIdentifier       | 0..1  | Identifier      | Identifier of composite request                                                                                      |
| status                | 0..1  | code            | draft \| active \| on-hold \| revoked \| completed \| entered-in-error \| unknown                                    |
| intent                | 1..1  | code            | proposal \| plan \| directive \| order \| original-order \| reflex-order \| filler-order \| instance-order \| option |
| priority              | 0..1  | code            | routine \| urgent \| asap \| stat                                                                                    |
| code[x]               | 1..1  | Reference       | Device requested                                                                                                     |
| parameter             | 0..\* | BackboneElement | Device details                                                                                                       |
| subject               | 1..1  | Reference       | Focus of request                                                                                                     |
| encounter             | 0..1  | Reference       | Encounter motivating request                                                                                         |
| occurrence[x]         | 0..1  | dateTime        | Desired time or schedule for use                                                                                     |
| authoredOn            | 0..1  | dateTime        | When recorded                                                                                                        |
| requester             | 0..1  | Reference       | Who/what is requesting diagnostics                                                                                   |
| performerType         | 0..1  | CodeableConcept | Filler role                                                                                                          |
| performer             | 0..1  | Reference       | Requested Filler                                                                                                     |
| reasonCode            | 0..\* | CodeableConcept | Coded Reason for request                                                                                             |
| reasonReference       | 0..\* | Reference       | Linked Reason for request                                                                                            |
| insurance             | 0..\* | Reference       | Associated insurance coverage                                                                                        |
| supportingInfo        | 0..\* | Reference       | Additional clinical information                                                                                      |
| note                  | 0..\* | Annotation      | Notes or comments                                                                                                    |
| relevantHistory       | 0..\* | Reference       | Request provenance                                                                                                   |

## Search Parameters

| Name                   | Type      | Description                                                            | Expression                          |
| ---------------------- | --------- | ---------------------------------------------------------------------- | ----------------------------------- |
| code                   | token     | Code for what is being requested/ordered                               | DeviceRequest.code                  |
| identifier             | token     | Business identifier for request/order                                  | DeviceRequest.identifier            |
| patient                | reference | Individual the service is ordered for                                  | DeviceRequest.subject               |
| encounter              | reference | Encounter during which request was created                             | DeviceRequest.encounter             |
| authored-on            | date      | When the request transitioned to being actionable                      | DeviceRequest.authoredOn            |
| based-on               | reference | Plan/proposal/order fulfilled by this request                          | DeviceRequest.basedOn               |
| device                 | reference | Reference to resource that is being requested/ordered                  | DeviceRequest.code                  |
| event-date             | date      | When service should occur                                              | DeviceRequest.occurrence            |
| group-identifier       | token     | Composite request this is part of                                      | DeviceRequest.groupIdentifier       |
| instantiates-canonical | reference | Instantiates FHIR protocol or definition                               | DeviceRequest.instantiatesCanonical |
| instantiates-uri       | uri       | Instantiates external protocol or definition                           | DeviceRequest.instantiatesUri       |
| insurance              | reference | Associated insurance coverage                                          | DeviceRequest.insurance             |
| intent                 | token     | proposal \| plan \| original-order \|reflex-order                      | DeviceRequest.intent                |
| performer              | reference | Desired performer for service                                          | DeviceRequest.performer             |
| prior-request          | reference | Request takes the place of referenced completed or terminated requests | DeviceRequest.priorRequest          |
| requester              | reference | Who/what is requesting service                                         | DeviceRequest.requester             |
| status                 | token     | entered-in-error \| draft \| active \|suspended \| completed           | DeviceRequest.status                |
| subject                | reference | Individual the service is ordered for                                  | DeviceRequest.subject               |

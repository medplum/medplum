---
title: ServiceRequest
sidebar_position: 534
---

# ServiceRequest

A record of a request for service such as diagnostic investigations, treatments, or operations to be performed.

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
| identifier            | 0..\* | Identifier      | Identifiers assigned to this order                                                                                   |
| instantiatesCanonical | 0..\* | canonical       | Instantiates FHIR protocol or definition                                                                             |
| instantiatesUri       | 0..\* | uri             | Instantiates external protocol or definition                                                                         |
| basedOn               | 0..\* | Reference       | What request fulfills                                                                                                |
| replaces              | 0..\* | Reference       | What request replaces                                                                                                |
| requisition           | 0..1  | Identifier      | Composite Request ID                                                                                                 |
| status                | 1..1  | code            | draft \| active \| on-hold \| revoked \| completed \| entered-in-error \| unknown                                    |
| intent                | 1..1  | code            | proposal \| plan \| directive \| order \| original-order \| reflex-order \| filler-order \| instance-order \| option |
| category              | 0..\* | CodeableConcept | Classification of service                                                                                            |
| priority              | 0..1  | code            | routine \| urgent \| asap \| stat                                                                                    |
| doNotPerform          | 0..1  | boolean         | True if service/procedure should not be performed                                                                    |
| code                  | 0..1  | CodeableConcept | What is being requested/ordered                                                                                      |
| orderDetail           | 0..\* | CodeableConcept | Additional order information                                                                                         |
| quantity[x]           | 0..1  | Quantity        | Service amount                                                                                                       |
| subject               | 1..1  | Reference       | Individual or Entity the service is ordered for                                                                      |
| encounter             | 0..1  | Reference       | Encounter in which the request was created                                                                           |
| occurrence[x]         | 0..1  | dateTime        | When service should occur                                                                                            |
| asNeeded[x]           | 0..1  | boolean         | Preconditions for service                                                                                            |
| authoredOn            | 0..1  | dateTime        | Date request signed                                                                                                  |
| requester             | 0..1  | Reference       | Who/what is requesting service                                                                                       |
| performerType         | 0..1  | CodeableConcept | Performer role                                                                                                       |
| performer             | 0..\* | Reference       | Requested performer                                                                                                  |
| locationCode          | 0..\* | CodeableConcept | Requested location                                                                                                   |
| locationReference     | 0..\* | Reference       | Requested location                                                                                                   |
| reasonCode            | 0..\* | CodeableConcept | Explanation/Justification for procedure or service                                                                   |
| reasonReference       | 0..\* | Reference       | Explanation/Justification for service or service                                                                     |
| insurance             | 0..\* | Reference       | Associated insurance coverage                                                                                        |
| supportingInfo        | 0..\* | Reference       | Additional clinical information                                                                                      |
| specimen              | 0..\* | Reference       | Procedure Samples                                                                                                    |
| bodySite              | 0..\* | CodeableConcept | Location on Body                                                                                                     |
| note                  | 0..\* | Annotation      | Comments                                                                                                             |
| patientInstruction    | 0..1  | string          | Patient or consumer-oriented instructions                                                                            |
| relevantHistory       | 0..\* | Reference       | Request provenance                                                                                                   |

## Search Parameters

| Name                   | Type      | Description                                                                                                          | Expression                           |
| ---------------------- | --------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| code                   | token     | What is being requested/ordered                                                                                      | ServiceRequest.code                  |
| identifier             | token     | Identifiers assigned to this order                                                                                   | ServiceRequest.identifier            |
| patient                | reference | Search by subject - a patient                                                                                        | ServiceRequest.subject               |
| encounter              | reference | An encounter in which this request is made                                                                           | ServiceRequest.encounter             |
| authored               | date      | Date request signed                                                                                                  | ServiceRequest.authoredOn            |
| based-on               | reference | What request fulfills                                                                                                | ServiceRequest.basedOn               |
| body-site              | token     | Where procedure is going to be done                                                                                  | ServiceRequest.bodySite              |
| category               | token     | Classification of service                                                                                            | ServiceRequest.category              |
| instantiates-canonical | reference | Instantiates FHIR protocol or definition                                                                             | ServiceRequest.instantiatesCanonical |
| instantiates-uri       | uri       | Instantiates external protocol or definition                                                                         | ServiceRequest.instantiatesUri       |
| intent                 | token     | proposal \| plan \| directive \| order \| original-order \| reflex-order \| filler-order \| instance-order \| option | ServiceRequest.intent                |
| occurrence             | date      | When service should occur                                                                                            | ServiceRequest.occurrence            |
| order-detail           | string    | Detail text of the order                                                                                             | ServiceRequest.orderDetail.text      |
| performer              | reference | Requested performer                                                                                                  | ServiceRequest.performer             |
| performer-type         | token     | Performer role                                                                                                       | ServiceRequest.performerType         |
| priority               | token     | routine \| urgent \| asap \| stat                                                                                    | ServiceRequest.priority              |
| replaces               | reference | What request replaces                                                                                                | ServiceRequest.replaces              |
| requester              | reference | Who/what is requesting service                                                                                       | ServiceRequest.requester             |
| requisition            | token     | Composite Request ID                                                                                                 | ServiceRequest.requisition           |
| specimen               | reference | Specimen to be tested                                                                                                | ServiceRequest.specimen              |
| status                 | token     | draft \| active \| on-hold \| revoked \| completed \| entered-in-error \| unknown                                    | ServiceRequest.status                |
| subject                | reference | Search by subject                                                                                                    | ServiceRequest.subject               |

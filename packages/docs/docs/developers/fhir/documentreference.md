---
title: DocumentReference
sidebar_position: 233
---

# DocumentReference

A reference to a document of any kind for any purpose. Provides metadata about the document so that the document can be
discovered and managed. The scope of a document is any seralized object with a mime-type, so includes formal patient
centric documents (CDA), cliical notes, scanned paper, and non-patient specific documents like policy text.

## Properties

| Name              | Card  | Type            | Description                                            |
| ----------------- | ----- | --------------- | ------------------------------------------------------ |
| id                | 0..1  | string          | Logical id of this artifact                            |
| meta              | 0..1  | Meta            | Metadata about the resource                            |
| implicitRules     | 0..1  | uri             | A set of rules under which this content was created    |
| language          | 0..1  | code            | Language of the resource content                       |
| text              | 0..1  | Narrative       | Text summary of the resource, for human interpretation |
| contained         | 0..\* | Resource        | Contained, inline Resources                            |
| extension         | 0..\* | Extension       | Additional content defined by implementations          |
| modifierExtension | 0..\* | Extension       | Extensions that cannot be ignored                      |
| masterIdentifier  | 0..1  | Identifier      | Master Version Specific Identifier                     |
| identifier        | 0..\* | Identifier      | Other identifiers for the document                     |
| status            | 1..1  | code            | current \| superseded \| entered-in-error              |
| docStatus         | 0..1  | code            | preliminary \| final \| amended \| entered-in-error    |
| type              | 0..1  | CodeableConcept | Kind of document (LOINC if possible)                   |
| category          | 0..\* | CodeableConcept | Categorization of document                             |
| subject           | 0..1  | Reference       | Who/what is the subject of the document                |
| date              | 0..1  | instant         | When this document reference was created               |
| author            | 0..\* | Reference       | Who and/or what authored the document                  |
| authenticator     | 0..1  | Reference       | Who/what authenticated the document                    |
| custodian         | 0..1  | Reference       | Organization which maintains the document              |
| relatesTo         | 0..\* | BackboneElement | Relationships to other documents                       |
| description       | 0..1  | string          | Human-readable description                             |
| securityLabel     | 0..\* | CodeableConcept | Document security-tags                                 |
| content           | 1..\* | BackboneElement | Document referenced                                    |
| context           | 0..1  | BackboneElement | Clinical context of document                           |

## Search Parameters

| Name           | Type      | Description                                                                      | Expression                                       |
| -------------- | --------- | -------------------------------------------------------------------------------- | ------------------------------------------------ |
| identifier     | token     | Master Version Specific Identifier                                               | DocumentReference.masterIdentifier               |
| patient        | reference | Who/what is the subject of the document                                          | DocumentReference.subject                        |
| type           | token     | Kind of document (LOINC if possible)                                             | DocumentReference.type                           |
| encounter      | reference | Context of the document content                                                  | DocumentReference.context.encounter              |
| authenticator  | reference | Who/what authenticated the document                                              | DocumentReference.authenticator                  |
| author         | reference | Who and/or what authored the document                                            | DocumentReference.author                         |
| category       | token     | Categorization of document                                                       | DocumentReference.category                       |
| contenttype    | token     | Mime type of the content, with charset etc.                                      | DocumentReference.content.attachment.contentType |
| custodian      | reference | Organization which maintains the document                                        | DocumentReference.custodian                      |
| date           | date      | When this document reference was created                                         | DocumentReference.date                           |
| description    | string    | Human-readable description                                                       | DocumentReference.description                    |
| event          | token     | Main clinical acts documented                                                    | DocumentReference.context.event                  |
| facility       | token     | Kind of facility where patient was seen                                          | DocumentReference.context.facilityType           |
| format         | token     | Format/content rules for the document                                            | DocumentReference.content.format                 |
| language       | token     | Human language of the content (BCP-47)                                           | DocumentReference.content.attachment.language    |
| location       | uri       | Uri where the data can be found                                                  | DocumentReference.content.attachment.url         |
| period         | date      | Time of service that is being documented                                         | DocumentReference.context.period                 |
| related        | reference | Related identifiers or resources                                                 | DocumentReference.context.related                |
| relatesto      | reference | Target of the relationship                                                       | DocumentReference.relatesTo.target               |
| relation       | token     | replaces \| transforms \| signs \| appends                                       | DocumentReference.relatesTo.code                 |
| security-label | token     | Document security-tags                                                           | DocumentReference.securityLabel                  |
| setting        | token     | Additional details about where the content was created (e.g. clinical specialty) | DocumentReference.context.practiceSetting        |
| status         | token     | current \| superseded \| entered-in-error                                        | DocumentReference.status                         |
| subject        | reference | Who/what is the subject of the document                                          | DocumentReference.subject                        |
| relationship   | composite | Combination of relation and relatesTo                                            | DocumentReference.relatesTo                      |

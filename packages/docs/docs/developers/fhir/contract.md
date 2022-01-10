---
title: Contract
sidebar_position: 178
---

# Contract

Legally enforceable, formally recorded unilateral or bilateral directive i.e., a policy or agreement.

## Properties

| Name                                                                                        | Card  | Type            | Description                                                                                   |
| ------------------------------------------------------------------------------------------- | ----- | --------------- | --------------------------------------------------------------------------------------------- |
| id                                                                                          | 0..1  | string          | Logical id of this artifact                                                                   |
| meta                                                                                        | 0..1  | Meta            | Metadata about the resource                                                                   |
| implicitRules                                                                               | 0..1  | uri             | A set of rules under which this content was created                                           |
| language                                                                                    | 0..1  | code            | Language of the resource content                                                              |
| text                                                                                        | 0..1  | Narrative       | Text summary of the resource, for human interpretation                                        |
| contained                                                                                   | 0..\* | Resource        | Contained, inline Resources                                                                   |
| extension                                                                                   | 0..\* | Extension       | Additional content defined by implementations                                                 |
| modifierExtension                                                                           | 0..\* | Extension       | Extensions that cannot be ignored                                                             |
| identifier                                                                                  | 0..\* | Identifier      | Contract number                                                                               |
| url                                                                                         | 0..1  | uri             | Basal definition                                                                              |
| version                                                                                     | 0..1  | string          | Business edition                                                                              |
| status                                                                                      | 0..1  | code            | amended \| appended \| cancelled \| disputed \| entered-in-error \| executable \| executed \| |
| negotiable \| offered \| policy \| rejected \| renewed \| revoked \| resolved \| terminated |
| legalState                                                                                  | 0..1  | CodeableConcept | Negotiation status                                                                            |
| instantiatesCanonical                                                                       | 0..1  | Reference       | Source Contract Definition                                                                    |
| instantiatesUri                                                                             | 0..1  | uri             | External Contract Definition                                                                  |
| contentDerivative                                                                           | 0..1  | CodeableConcept | Content derived from the basal information                                                    |
| issued                                                                                      | 0..1  | dateTime        | When this Contract was issued                                                                 |
| applies                                                                                     | 0..1  | Period          | Effective time                                                                                |
| expirationType                                                                              | 0..1  | CodeableConcept | Contract cessation cause                                                                      |
| subject                                                                                     | 0..\* | Reference       | Contract Target Entity                                                                        |
| authority                                                                                   | 0..\* | Reference       | Authority under which this Contract has standing                                              |
| domain                                                                                      | 0..\* | Reference       | A sphere of control governed by an authoritative jurisdiction, organization, or person        |
| site                                                                                        | 0..\* | Reference       | Specific Location                                                                             |
| name                                                                                        | 0..1  | string          | Computer friendly designation                                                                 |
| title                                                                                       | 0..1  | string          | Human Friendly name                                                                           |
| subtitle                                                                                    | 0..1  | string          | Subordinate Friendly name                                                                     |
| alias                                                                                       | 0..\* | string          | Acronym or short name                                                                         |
| author                                                                                      | 0..1  | Reference       | Source of Contract                                                                            |
| scope                                                                                       | 0..1  | CodeableConcept | Range of Legal Concerns                                                                       |
| topic[x]                                                                                    | 0..1  | CodeableConcept | Focus of contract interest                                                                    |
| type                                                                                        | 0..1  | CodeableConcept | Legal instrument category                                                                     |
| subType                                                                                     | 0..\* | CodeableConcept | Subtype within the context of type                                                            |
| contentDefinition                                                                           | 0..1  | BackboneElement | Contract precursor content                                                                    |
| term                                                                                        | 0..\* | BackboneElement | Contract Term List                                                                            |
| supportingInfo                                                                              | 0..\* | Reference       | Extra Information                                                                             |
| relevantHistory                                                                             | 0..\* | Reference       | Key event in Contract History                                                                 |
| signer                                                                                      | 0..\* | BackboneElement | Contract Signatory                                                                            |
| friendly                                                                                    | 0..\* | BackboneElement | Contract Friendly Language                                                                    |
| legal                                                                                       | 0..\* | BackboneElement | Contract Legal Language                                                                       |
| rule                                                                                        | 0..\* | BackboneElement | Computable Contract Language                                                                  |
| legallyBinding[x]                                                                           | 0..1  | Attachment      | Binding Contract                                                                              |

## Search Parameters

| Name         | Type      | Description                                                | Expression               |
| ------------ | --------- | ---------------------------------------------------------- | ------------------------ |
| authority    | reference | The authority of the contract                              | Contract.authority       |
| domain       | reference | The domain of the contract                                 | Contract.domain          |
| identifier   | token     | The identity of the contract                               | Contract.identifier      |
| instantiates | uri       | A source definition of the contract                        | Contract.instantiatesUri |
| issued       | date      | The date/time the contract was issued                      | Contract.issued          |
| patient      | reference | The identity of the subject of the contract (if a patient) | Contract.subject         |
| signer       | reference | Contract Signatory Party                                   | Contract.signer.party    |
| status       | token     | The status of the contract                                 | Contract.status          |
| subject      | reference | The identity of the subject of the contract                | Contract.subject         |
| url          | uri       | The basal contract definition                              | Contract.url             |

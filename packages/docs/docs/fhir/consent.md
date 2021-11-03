---
title: Consent
sidebar_position: 172
---

# Consent

A record of a healthcare consumer’s  choices, which permits or denies identified recipient(s) or recipient role(s) to
  perform one or more actions within a given policy context, for specific purposes and periods of time.

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
| identifier | 0..* | Identifier | Identifier for this record (external references)
| status | 1..1 | code | draft \| proposed \| active \| rejected \| inactive \| entered-in-error
| scope | 1..1 | CodeableConcept | Which of the four areas this resource covers (extensible)
| category | 1..* | CodeableConcept | Classification of the consent statement - for indexing/retrieval
| patient | 0..1 | Reference | Who the consent applies to
| dateTime | 0..1 | dateTime | When this Consent was created or indexed
| performer | 0..* | Reference | Who is agreeing to the policy and rules
| organization | 0..* | Reference | Custodian of the consent
| source[x] | 0..1 | Attachment | Source from which this consent is taken
| policy | 0..* | BackboneElement | Policies covered by this consent
| policyRule | 0..1 | CodeableConcept | Regulation that this consents to
| verification | 0..* | BackboneElement | Consent Verified by patient or family
| provision | 0..1 | BackboneElement | Constraints to the base Consent.policyRule

## Search Parameters

| Name | Type | Description | Expression
| --- | --- | --- | --- |
| date | date | When this Consent was created or indexed | Consent.dateTime
| identifier | token | Identifier for this record (external references) | Consent.identifier
| patient | reference | Who the consent applies to | Consent.patient
| action | token | Actions controlled by this rule | Consent.provision.action
| actor | reference | Resource for the actor (or group, by role) | Consent.provision.actor.reference
| category | token | Classification of the consent statement - for indexing/retrieval | Consent.category
| consentor | reference | Who is agreeing to the policy and rules | Consent.performer
| data | reference | The actual data reference | Consent.provision.data.reference
| organization | reference | Custodian of the consent | Consent.organization
| period | date | Timeframe for this rule | Consent.provision.period
| purpose | token | Context of activities covered by this rule | Consent.provision.purpose
| scope | token | Which of the four areas this resource covers (extensible) | Consent.scope
| security-label | token | Security Labels that define affected resources | Consent.provision.securityLabel
| source-reference | reference | Search by reference to a Consent, DocumentReference, Contract  or QuestionnaireResponse | Consent.source
| status | token | draft \| proposed \| active \| rejected \| inactive \| entered-in-error | Consent.status


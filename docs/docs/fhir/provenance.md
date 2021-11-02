---
title: Provenance
sidebar_position: 499
---

# Provenance

Provenance of a resource is a record that describes entities and processes involved in producing and delivering or
  otherwise influencing that resource. Provenance provides a critical foundation for assessing authenticity, enabling
  trust, and allowing reproducibility. Provenance assertions are a form of contextual metadata and can themselves become
  important records with their own provenance. Provenance statement indicates clinical significance in terms of confidence
  in authenticity, reliability, and trustworthiness, integrity, and stage in lifecycle (e.g. Document Completion - has the
  artifact been legally authenticated), all of which may impact security, privacy, and trust policies.

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
| target | 1..* | Reference | Target Reference(s) (usually version specific)
| occurred[x] | 0..1 | Period | When the activity occurred
| recorded | 1..1 | instant | When the activity was recorded / updated
| policy | 0..* | uri | Policy or plan the activity was defined by
| location | 0..1 | Reference | Where the activity occurred, if relevant
| reason | 0..* | CodeableConcept | Reason the activity is occurring
| activity | 0..1 | CodeableConcept | Activity that occurred
| agent | 1..* | BackboneElement | Actor involved
| entity | 0..* | BackboneElement | An entity used in this activity
| signature | 0..* | Signature | Signature on target

## Search Parameters

| Name | Type | Description | Expression
| --- | --- | --- | --- |
| agent | reference | Who participated | Provenance.agent.who
| agent-role | token | What the agents role was | Provenance.agent.role
| agent-type | token | How the agent participated | Provenance.agent.type
| entity | reference | Identity of entity | Provenance.entity.what
| location | reference | Where the activity occurred, if relevant | Provenance.location
| patient | reference | Target Reference(s) (usually version specific) | Provenance.target
| recorded | date | When the activity was recorded / updated | Provenance.recorded
| signature-type | token | Indication of the reason the entity signed the object(s) | Provenance.signature.type
| target | reference | Target Reference(s) (usually version specific) | Provenance.target
| when | date | When the activity occurred | Provenance.occurred


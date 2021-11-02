---
title: Composition
sidebar_position: 158
---

# Composition

A set of healthcare-related information that is assembled together into a single logical package that provides a single
  coherent statement of meaning, establishes its own context and that has clinical attestation with regard to who is
  making the statement. A Composition defines the structure and narrative content necessary for a document. However, a
  Composition alone does not constitute a document. Rather, the Composition must be the first entry in a Bundle where
  Bundle.type=document, and any other resources referenced from Composition must be included as subsequent entries in the
  Bundle (for example Patient, Practitioner, Encounter, etc.).

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
| identifier | 0..1 | Identifier | Version-independent identifier for the Composition
| status | 1..1 | code | preliminary \| final \| amended \| entered-in-error
| type | 1..1 | CodeableConcept | Kind of composition (LOINC if possible)
| category | 0..* | CodeableConcept | Categorization of Composition
| subject | 0..1 | Reference | Who and/or what the composition is about
| encounter | 0..1 | Reference | Context of the Composition
| date | 1..1 | dateTime | Composition editing time
| author | 1..* | Reference | Who and/or what authored the composition
| title | 1..1 | string | Human Readable name/title
| confidentiality | 0..1 | code | As defined by affinity domain
| attester | 0..* | BackboneElement | Attests to accuracy of composition
| custodian | 0..1 | Reference | Organization which maintains the composition
| relatesTo | 0..* | BackboneElement | Relationships to other compositions/documents
| event | 0..* | BackboneElement | The clinical service(s) being documented
| section | 0..* | BackboneElement | Composition is broken into sections

## Search Parameters

| Name | Type | Description | Expression
| --- | --- | --- | --- |
| date | date | Composition editing time | Composition.date
| identifier | token | Version-independent identifier for the Composition | Composition.identifier
| patient | reference | Who and/or what the composition is about | Composition.subject
| type | token | Kind of composition (LOINC if possible) | Composition.type
| attester | reference | Who attested the composition | Composition.attester.party
| author | reference | Who and/or what authored the composition | Composition.author
| category | token | Categorization of Composition | Composition.category
| confidentiality | token | As defined by affinity domain | Composition.confidentiality
| context | token | Code(s) that apply to the event being documented | Composition.event.code
| encounter | reference | Context of the Composition | Composition.encounter
| entry | reference | A reference to data that supports this section | Composition.section.entry
| period | date | The period covered by the documentation | Composition.event.period
| related-id | token | Target of the relationship | Composition.relatesTo.target
| related-ref | reference | Target of the relationship | Composition.relatesTo.target
| section | token | Classification of section (recommended) | Composition.section.code
| status | token | preliminary \| final \| amended \| entered-in-error | Composition.status
| subject | reference | Who and/or what the composition is about | Composition.subject
| title | string | Human Readable name/title | Composition.title


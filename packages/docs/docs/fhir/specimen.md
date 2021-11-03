---
title: Specimen
sidebar_position: 536
---

# Specimen

A sample to be used for analysis.

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
| identifier | 0..* | Identifier | External Identifier
| accessionIdentifier | 0..1 | Identifier | Identifier assigned by the lab
| status | 0..1 | code | available \| unavailable \| unsatisfactory \| entered-in-error
| type | 0..1 | CodeableConcept | Kind of material that forms the specimen
| subject | 0..1 | Reference | Where the specimen came from. This may be from patient(s), from a location (e.g., the
  source of an environmental sample), or a sampling of a substance or a device
| receivedTime | 0..1 | dateTime | The time when specimen was received for processing
| parent | 0..* | Reference | Specimen from which this specimen originated
| request | 0..* | Reference | Why the specimen was collected
| collection | 0..1 | BackboneElement | Collection details
| processing | 0..* | BackboneElement | Processing and processing step details
| container | 0..* | BackboneElement | Direct container of specimen (tube/slide, etc.)
| condition | 0..* | CodeableConcept | State of the specimen
| note | 0..* | Annotation | Comments

## Search Parameters

| Name | Type | Description | Expression
| --- | --- | --- | --- |
| accession | token | The accession number associated with the specimen | Specimen.accessionIdentifier
| bodysite | token | The code for the body site from where the specimen originated | Specimen.collection.bodySite
| collected | date | The date the specimen was collected | Specimen.collection.collected
| collector | reference | Who collected the specimen | Specimen.collection.collector
| container | token | The kind of specimen container | Specimen.container.type
| container-id | token | The unique identifier associated with the specimen container | Specimen.container.identifier
| identifier | token | The unique identifier associated with the specimen | Specimen.identifier
| parent | reference | The parent of the specimen | Specimen.parent
| patient | reference | The patient the specimen comes from | Specimen.subject
| status | token | available \| unavailable \| unsatisfactory \| entered-in-error | Specimen.status
| subject | reference | The subject of the specimen | Specimen.subject
| type | token | The specimen type | Specimen.type


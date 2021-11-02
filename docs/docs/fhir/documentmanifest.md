---
title: DocumentManifest
sidebar_position: 231
---

# DocumentManifest

A collection of documents compiled for a purpose together with metadata that applies to the collection.

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
| masterIdentifier | 0..1 | Identifier | Unique Identifier for the set of documents
| identifier | 0..* | Identifier | Other identifiers for the manifest
| status | 1..1 | code | current \| superseded \| entered-in-error
| type | 0..1 | CodeableConcept | Kind of document set
| subject | 0..1 | Reference | The subject of the set of documents
| created | 0..1 | dateTime | When this document manifest created
| author | 0..* | Reference | Who and/or what authored the DocumentManifest
| recipient | 0..* | Reference | Intended to get notified about this set of documents
| source | 0..1 | uri | The source system/application/software
| description | 0..1 | string | Human-readable description (title)
| content | 1..* | Reference | Items in manifest
| related | 0..* | BackboneElement | Related things

## Search Parameters

| Name | Type | Description | Expression
| --- | --- | --- | --- |
| identifier | token | Unique Identifier for the set of documents | DocumentManifest.masterIdentifier
| patient | reference | The subject of the set of documents | DocumentManifest.subject
| type | token | Kind of document set | DocumentManifest.type
| author | reference | Who and/or what authored the DocumentManifest | DocumentManifest.author
| created | date | When this document manifest created | DocumentManifest.created
| description | string | Human-readable description (title) | DocumentManifest.description
| item | reference | Items in manifest | DocumentManifest.content
| recipient | reference | Intended to get notified about this set of documents | DocumentManifest.recipient
| related-id | token | Identifiers of things that are related | DocumentManifest.related.identifier
| related-ref | reference | Related Resource | DocumentManifest.related.ref
| source | uri | The source system/application/software | DocumentManifest.source
| status | token | current \| superseded \| entered-in-error | DocumentManifest.status
| subject | reference | The subject of the set of documents | DocumentManifest.subject


---
title: StructureMap
sidebar_position: 550
---

# StructureMap

A Map of relationships between 2 structures that can be used to transform data.

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
| url | 1..1 | uri | Canonical identifier for this structure map, represented as a URI (globally unique)
| identifier | 0..* | Identifier | Additional identifier for the structure map
| version | 0..1 | string | Business version of the structure map
| name | 1..1 | string | Name for this structure map (computer friendly)
| title | 0..1 | string | Name for this structure map (human friendly)
| status | 1..1 | code | draft \| active \| retired \| unknown
| experimental | 0..1 | boolean | For testing purposes, not real usage
| date | 0..1 | dateTime | Date last changed
| publisher | 0..1 | string | Name of the publisher (organization or individual)
| contact | 0..* | ContactDetail | Contact details for the publisher
| description | 0..1 | markdown | Natural language description of the structure map
| useContext | 0..* | UsageContext | The context that the content is intended to support
| jurisdiction | 0..* | CodeableConcept | Intended jurisdiction for structure map (if applicable)
| purpose | 0..1 | markdown | Why this structure map is defined
| copyright | 0..1 | markdown | Use and/or publishing restrictions
| structure | 0..* | BackboneElement | Structure Definition used by this map
| import | 0..* | canonical | Other maps used by this map (canonical URLs)
| group | 1..* | BackboneElement | Named sections for reader convenience

## Search Parameters

| Name | Type | Description | Expression
| --- | --- | --- | --- |
| context | token | A use context assigned to the structure map | StructureMap.useContext.value
| context-quantity | quantity | A quantity- or range-valued use context assigned to the structure map | StructureMap.useContext.value
| context-type | token | A type of use context assigned to the structure map | StructureMap.useContext.code
| date | date | The structure map publication date | StructureMap.date
| description | string | The description of the structure map | StructureMap.description
| jurisdiction | token | Intended jurisdiction for the structure map | StructureMap.jurisdiction
| name | string | Computationally friendly name of the structure map | StructureMap.name
| publisher | string | Name of the publisher of the structure map | StructureMap.publisher
| status | token | The current status of the structure map | StructureMap.status
| title | string | The human-friendly name of the structure map | StructureMap.title
| url | uri | The uri that identifies the structure map | StructureMap.url
| version | token | The business version of the structure map | StructureMap.version
| context-type-quantity | composite | A use context type and quantity- or range-based value assigned to the structure map | StructureMap.useContext
| context-type-value | composite | A use context type and value assigned to the structure map | StructureMap.useContext
| identifier | token | External identifier for the structure map | StructureMap.identifier


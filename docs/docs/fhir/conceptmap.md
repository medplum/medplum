---
title: ConceptMap
sidebar_position: 163
---

# ConceptMap

A statement of relationships from one set of concepts to one or more other concepts - either concepts in code systems,
  or data element/data element concepts, or classes in class models.

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
| url | 0..1 | uri | Canonical identifier for this concept map, represented as a URI (globally unique)
| identifier | 0..1 | Identifier | Additional identifier for the concept map
| version | 0..1 | string | Business version of the concept map
| name | 0..1 | string | Name for this concept map (computer friendly)
| title | 0..1 | string | Name for this concept map (human friendly)
| status | 1..1 | code | draft \| active \| retired \| unknown
| experimental | 0..1 | boolean | For testing purposes, not real usage
| date | 0..1 | dateTime | Date last changed
| publisher | 0..1 | string | Name of the publisher (organization or individual)
| contact | 0..* | ContactDetail | Contact details for the publisher
| description | 0..1 | markdown | Natural language description of the concept map
| useContext | 0..* | UsageContext | The context that the content is intended to support
| jurisdiction | 0..* | CodeableConcept | Intended jurisdiction for concept map (if applicable)
| purpose | 0..1 | markdown | Why this concept map is defined
| copyright | 0..1 | markdown | Use and/or publishing restrictions
| source[x] | 0..1 | uri | The source value set that contains the concepts that are being mapped
| target[x] | 0..1 | uri | The target value set which provides context for the mappings
| group | 0..* | BackboneElement | Same source and target systems

## Search Parameters

| Name | Type | Description | Expression
| --- | --- | --- | --- |
| context | token | A use context assigned to the concept map | ConceptMap.useContext.value
| context-quantity | quantity | A quantity- or range-valued use context assigned to the concept map | ConceptMap.useContext.value
| context-type | token | A type of use context assigned to the concept map | ConceptMap.useContext.code
| date | date | The concept map publication date | ConceptMap.date
| description | string | The description of the concept map | ConceptMap.description
| jurisdiction | token | Intended jurisdiction for the concept map | ConceptMap.jurisdiction
| name | string | Computationally friendly name of the concept map | ConceptMap.name
| publisher | string | Name of the publisher of the concept map | ConceptMap.publisher
| status | token | The current status of the concept map | ConceptMap.status
| title | string | The human-friendly name of the concept map | ConceptMap.title
| url | uri | The uri that identifies the concept map | ConceptMap.url
| version | token | The business version of the concept map | ConceptMap.version
| context-type-quantity | composite | A use context type and quantity- or range-based value assigned to the concept map | ConceptMap.useContext
| context-type-value | composite | A use context type and value assigned to the concept map | ConceptMap.useContext
| identifier | token | External identifier for the concept map | ConceptMap.identifier
| dependson | uri | Reference to property mapping depends on | ConceptMap.group.element.target.dependsOn.property
| other | reference | canonical reference to an additional ConceptMap to use for mapping if the source concept is unmapped | ConceptMap.group.unmapped.url
| product | uri | Reference to property mapping depends on | ConceptMap.group.element.target.product.property
| source | reference | The source value set that contains the concepts that are being mapped | ConceptMap.source
| source-code | token | Identifies element being mapped | ConceptMap.group.element.code
| source-system | uri | Source system where concepts to be mapped are defined | ConceptMap.group.source
| source-uri | reference | The source value set that contains the concepts that are being mapped | ConceptMap.source
| target | reference | The target value set which provides context for the mappings | ConceptMap.target
| target-code | token | Code that identifies the target element | ConceptMap.group.element.target.code
| target-system | uri | Target system that the concepts are to be mapped to | ConceptMap.group.target
| target-uri | reference | The target value set which provides context for the mappings | ConceptMap.target


---
title: EventDefinition
sidebar_position: 257
---

# EventDefinition

The EventDefinition resource provides a reusable description of when a particular event can occur.

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
| url | 0..1 | uri | Canonical identifier for this event definition, represented as a URI (globally unique)
| identifier | 0..* | Identifier | Additional identifier for the event definition
| version | 0..1 | string | Business version of the event definition
| name | 0..1 | string | Name for this event definition (computer friendly)
| title | 0..1 | string | Name for this event definition (human friendly)
| subtitle | 0..1 | string | Subordinate title of the event definition
| status | 1..1 | code | draft \| active \| retired \| unknown
| experimental | 0..1 | boolean | For testing purposes, not real usage
| subject[x] | 0..1 | CodeableConcept | Type of individual the event definition is focused on
| date | 0..1 | dateTime | Date last changed
| publisher | 0..1 | string | Name of the publisher (organization or individual)
| contact | 0..* | ContactDetail | Contact details for the publisher
| description | 0..1 | markdown | Natural language description of the event definition
| useContext | 0..* | UsageContext | The context that the content is intended to support
| jurisdiction | 0..* | CodeableConcept | Intended jurisdiction for event definition (if applicable)
| purpose | 0..1 | markdown | Why this event definition is defined
| usage | 0..1 | string | Describes the clinical usage of the event definition
| copyright | 0..1 | markdown | Use and/or publishing restrictions
| approvalDate | 0..1 | date | When the event definition was approved by publisher
| lastReviewDate | 0..1 | date | When the event definition was last reviewed
| effectivePeriod | 0..1 | Period | When the event definition is expected to be used
| topic | 0..* | CodeableConcept | E.g. Education, Treatment, Assessment, etc.
| author | 0..* | ContactDetail | Who authored the content
| editor | 0..* | ContactDetail | Who edited the content
| reviewer | 0..* | ContactDetail | Who reviewed the content
| endorser | 0..* | ContactDetail | Who endorsed the content
| relatedArtifact | 0..* | RelatedArtifact | Additional documentation, citations, etc.
| trigger | 1..* | TriggerDefinition | "when" the event occurs (multiple = 'or')

## Search Parameters

| Name | Type | Description | Expression
| --- | --- | --- | --- |
| composed-of | reference | What resource is being referenced | EventDefinition.relatedArtifact
| context | token | A use context assigned to the event definition | EventDefinition.useContext.value
| context-quantity | quantity | A quantity- or range-valued use context assigned to the event definition | EventDefinition.useContext.value
| context-type | token | A type of use context assigned to the event definition | EventDefinition.useContext.code
| date | date | The event definition publication date | EventDefinition.date
| depends-on | reference | What resource is being referenced | EventDefinition.relatedArtifact
| derived-from | reference | What resource is being referenced | EventDefinition.relatedArtifact
| description | string | The description of the event definition | EventDefinition.description
| effective | date | The time during which the event definition is intended to be in use | EventDefinition.effectivePeriod
| identifier | token | External identifier for the event definition | EventDefinition.identifier
| jurisdiction | token | Intended jurisdiction for the event definition | EventDefinition.jurisdiction
| name | string | Computationally friendly name of the event definition | EventDefinition.name
| predecessor | reference | What resource is being referenced | EventDefinition.relatedArtifact
| publisher | string | Name of the publisher of the event definition | EventDefinition.publisher
| status | token | The current status of the event definition | EventDefinition.status
| successor | reference | What resource is being referenced | EventDefinition.relatedArtifact
| title | string | The human-friendly name of the event definition | EventDefinition.title
| topic | token | Topics associated with the module | EventDefinition.topic
| url | uri | The uri that identifies the event definition | EventDefinition.url
| version | token | The business version of the event definition | EventDefinition.version
| context-type-quantity | composite | A use context type and quantity- or range-based value assigned to the event definition | EventDefinition.useContext
| context-type-value | composite | A use context type and value assigned to the event definition | EventDefinition.useContext


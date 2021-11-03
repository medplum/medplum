---
title: PlanDefinition
sidebar_position: 483
---

# PlanDefinition

This resource allows for the definition of various types of plans as a sharable, consumable, and executable artifact.
  The resource is general enough to support the description of a broad range of clinical artifacts such as clinical
  decision support rules, order sets and protocols.

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
| url | 0..1 | uri | Canonical identifier for this plan definition, represented as a URI (globally unique)
| identifier | 0..* | Identifier | Additional identifier for the plan definition
| version | 0..1 | string | Business version of the plan definition
| name | 0..1 | string | Name for this plan definition (computer friendly)
| title | 0..1 | string | Name for this plan definition (human friendly)
| subtitle | 0..1 | string | Subordinate title of the plan definition
| type | 0..1 | CodeableConcept | order-set \| clinical-protocol \| eca-rule \| workflow-definition
| status | 1..1 | code | draft \| active \| retired \| unknown
| experimental | 0..1 | boolean | For testing purposes, not real usage
| subject[x] | 0..1 | CodeableConcept | Type of individual the plan definition is focused on
| date | 0..1 | dateTime | Date last changed
| publisher | 0..1 | string | Name of the publisher (organization or individual)
| contact | 0..* | ContactDetail | Contact details for the publisher
| description | 0..1 | markdown | Natural language description of the plan definition
| useContext | 0..* | UsageContext | The context that the content is intended to support
| jurisdiction | 0..* | CodeableConcept | Intended jurisdiction for plan definition (if applicable)
| purpose | 0..1 | markdown | Why this plan definition is defined
| usage | 0..1 | string | Describes the clinical usage of the plan
| copyright | 0..1 | markdown | Use and/or publishing restrictions
| approvalDate | 0..1 | date | When the plan definition was approved by publisher
| lastReviewDate | 0..1 | date | When the plan definition was last reviewed
| effectivePeriod | 0..1 | Period | When the plan definition is expected to be used
| topic | 0..* | CodeableConcept | E.g. Education, Treatment, Assessment
| author | 0..* | ContactDetail | Who authored the content
| editor | 0..* | ContactDetail | Who edited the content
| reviewer | 0..* | ContactDetail | Who reviewed the content
| endorser | 0..* | ContactDetail | Who endorsed the content
| relatedArtifact | 0..* | RelatedArtifact | Additional documentation, citations
| library | 0..* | canonical | Logic used by the plan definition
| goal | 0..* | BackboneElement | What the plan is trying to accomplish
| action | 0..* | BackboneElement | Action defined by the plan

## Search Parameters

| Name | Type | Description | Expression
| --- | --- | --- | --- |
| composed-of | reference | What resource is being referenced | PlanDefinition.relatedArtifact
| context | token | A use context assigned to the plan definition | PlanDefinition.useContext.value
| context-quantity | quantity | A quantity- or range-valued use context assigned to the plan definition | PlanDefinition.useContext.value
| context-type | token | A type of use context assigned to the plan definition | PlanDefinition.useContext.code
| date | date | The plan definition publication date | PlanDefinition.date
| definition | reference | Activity or plan definitions used by plan definition | PlanDefinition.action.definition
| depends-on | reference | What resource is being referenced | PlanDefinition.relatedArtifact
| derived-from | reference | What resource is being referenced | PlanDefinition.relatedArtifact
| description | string | The description of the plan definition | PlanDefinition.description
| effective | date | The time during which the plan definition is intended to be in use | PlanDefinition.effectivePeriod
| identifier | token | External identifier for the plan definition | PlanDefinition.identifier
| jurisdiction | token | Intended jurisdiction for the plan definition | PlanDefinition.jurisdiction
| name | string | Computationally friendly name of the plan definition | PlanDefinition.name
| predecessor | reference | What resource is being referenced | PlanDefinition.relatedArtifact
| publisher | string | Name of the publisher of the plan definition | PlanDefinition.publisher
| status | token | The current status of the plan definition | PlanDefinition.status
| successor | reference | What resource is being referenced | PlanDefinition.relatedArtifact
| title | string | The human-friendly name of the plan definition | PlanDefinition.title
| topic | token | Topics associated with the module | PlanDefinition.topic
| type | token | The type of artifact the plan (e.g. order-set, eca-rule, protocol) | PlanDefinition.type
| url | uri | The uri that identifies the plan definition | PlanDefinition.url
| version | token | The business version of the plan definition | PlanDefinition.version
| context-type-quantity | composite | A use context type and quantity- or range-based value assigned to the plan definition | PlanDefinition.useContext
| context-type-value | composite | A use context type and value assigned to the plan definition | PlanDefinition.useContext


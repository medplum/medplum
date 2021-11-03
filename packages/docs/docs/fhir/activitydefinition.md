---
title: ActivityDefinition
sidebar_position: 60
---

# ActivityDefinition

This resource allows for the definition of some activity to be performed, independent of a particular patient, practitioner, or other performance context.

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
| url | 0..1 | uri | Canonical identifier for this activity definition, represented as a URI (globally unique)
| identifier | 0..* | Identifier | Additional identifier for the activity definition
| version | 0..1 | string | Business version of the activity definition
| name | 0..1 | string | Name for this activity definition (computer friendly)
| title | 0..1 | string | Name for this activity definition (human friendly)
| subtitle | 0..1 | string | Subordinate title of the activity definition
| status | 1..1 | code | draft \| active \| retired \| unknown
| experimental | 0..1 | boolean | For testing purposes, not real usage
| subject[x] | 0..1 | CodeableConcept | Type of individual the activity definition is intended for
| date | 0..1 | dateTime | Date last changed
| publisher | 0..1 | string | Name of the publisher (organization or individual)
| contact | 0..* | ContactDetail | Contact details for the publisher
| description | 0..1 | markdown | Natural language description of the activity definition
| useContext | 0..* | UsageContext | The context that the content is intended to support
| jurisdiction | 0..* | CodeableConcept | Intended jurisdiction for activity definition (if applicable)
| purpose | 0..1 | markdown | Why this activity definition is defined
| usage | 0..1 | string | Describes the clinical usage of the activity definition
| copyright | 0..1 | markdown | Use and/or publishing restrictions
| approvalDate | 0..1 | date | When the activity definition was approved by publisher
| lastReviewDate | 0..1 | date | When the activity definition was last reviewed
| effectivePeriod | 0..1 | Period | When the activity definition is expected to be used
| topic | 0..* | CodeableConcept | E.g. Education, Treatment, Assessment, etc.
| author | 0..* | ContactDetail | Who authored the content
| editor | 0..* | ContactDetail | Who edited the content
| reviewer | 0..* | ContactDetail | Who reviewed the content
| endorser | 0..* | ContactDetail | Who endorsed the content
| relatedArtifact | 0..* | RelatedArtifact | Additional documentation, citations, etc.
| library | 0..* | canonical | Logic used by the activity definition
| kind | 0..1 | code | Kind of resource
| profile | 0..1 | canonical | What profile the resource needs to conform to
| code | 0..1 | CodeableConcept | Detail type of activity
| intent | 0..1 | code | proposal \| plan \| directive \| order \| original-order \| reflex-order \| filler-order \| instance-order \| option
| priority | 0..1 | code | routine \| urgent \| asap \| stat
| doNotPerform | 0..1 | boolean | True if the activity should not be performed
| timing[x] | 0..1 | Timing | When activity is to occur
| location | 0..1 | Reference | Where it should happen
| participant | 0..* | BackboneElement | Who should participate in the action
| product[x] | 0..1 | Reference | What's administered/supplied
| quantity | 0..1 | Quantity | How much is administered/consumed/supplied
| dosage | 0..* | Dosage | Detailed dosage instructions
| bodySite | 0..* | CodeableConcept | What part of body to perform on
| specimenRequirement | 0..* | Reference | What specimens are required to perform this action
| observationRequirement | 0..* | Reference | What observations are required to perform this action
| observationResultRequirement | 0..* | Reference | What observations must be produced by this action
| transform | 0..1 | canonical | Transform to apply the template
| dynamicValue | 0..* | BackboneElement | Dynamic aspects of the definition

## Search Parameters

| Name | Type | Description | Expression
| --- | --- | --- | --- |
| composed-of | reference | What resource is being referenced | ActivityDefinition.relatedArtifact
| context | token | A use context assigned to the activity definition | ActivityDefinition.useContext.value
| context-quantity | quantity | A quantity- or range-valued use context assigned to the activity definition | ActivityDefinition.useContext.value
| context-type | token | A type of use context assigned to the activity definition | ActivityDefinition.useContext.code
| date | date | The activity definition publication date | ActivityDefinition.date
| depends-on | reference | What resource is being referenced | ActivityDefinition.relatedArtifact
| derived-from | reference | What resource is being referenced | ActivityDefinition.relatedArtifact
| description | string | The description of the activity definition | ActivityDefinition.description
| effective | date | The time during which the activity definition is intended to be in use | ActivityDefinition.effectivePeriod
| identifier | token | External identifier for the activity definition | ActivityDefinition.identifier
| jurisdiction | token | Intended jurisdiction for the activity definition | ActivityDefinition.jurisdiction
| name | string | Computationally friendly name of the activity definition | ActivityDefinition.name
| predecessor | reference | What resource is being referenced | ActivityDefinition.relatedArtifact
| publisher | string | Name of the publisher of the activity definition | ActivityDefinition.publisher
| status | token | The current status of the activity definition | ActivityDefinition.status
| successor | reference | What resource is being referenced | ActivityDefinition.relatedArtifact
| title | string | The human-friendly name of the activity definition | ActivityDefinition.title
| topic | token | Topics associated with the module | ActivityDefinition.topic
| url | uri | The uri that identifies the activity definition | ActivityDefinition.url
| version | token | The business version of the activity definition | ActivityDefinition.version
| context-type-quantity | composite | A use context type and quantity- or range-based value assigned to the activity definition | ActivityDefinition.useContext
| context-type-value | composite | A use context type and value assigned to the activity definition | ActivityDefinition.useContext


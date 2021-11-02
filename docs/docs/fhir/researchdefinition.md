---
title: ResearchDefinition
sidebar_position: 516
---

# ResearchDefinition

The ResearchDefinition resource describes the conditional state (population and any exposures being compared within the
  population) and outcome (if specified) that the knowledge (evidence, assertion, recommendation) is about.

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
| url | 0..1 | uri | Canonical identifier for this research definition, represented as a URI (globally unique)
| identifier | 0..* | Identifier | Additional identifier for the research definition
| version | 0..1 | string | Business version of the research definition
| name | 0..1 | string | Name for this research definition (computer friendly)
| title | 0..1 | string | Name for this research definition (human friendly)
| shortTitle | 0..1 | string | Title for use in informal contexts
| subtitle | 0..1 | string | Subordinate title of the ResearchDefinition
| status | 1..1 | code | draft \| active \| retired \| unknown
| experimental | 0..1 | boolean | For testing purposes, not real usage
| subject[x] | 0..1 | CodeableConcept | E.g. Patient, Practitioner, RelatedPerson, Organization, Location, Device
| date | 0..1 | dateTime | Date last changed
| publisher | 0..1 | string | Name of the publisher (organization or individual)
| contact | 0..* | ContactDetail | Contact details for the publisher
| description | 0..1 | markdown | Natural language description of the research definition
| comment | 0..* | string | Used for footnotes or explanatory notes
| useContext | 0..* | UsageContext | The context that the content is intended to support
| jurisdiction | 0..* | CodeableConcept | Intended jurisdiction for research definition (if applicable)
| purpose | 0..1 | markdown | Why this research definition is defined
| usage | 0..1 | string | Describes the clinical usage of the ResearchDefinition
| copyright | 0..1 | markdown | Use and/or publishing restrictions
| approvalDate | 0..1 | date | When the research definition was approved by publisher
| lastReviewDate | 0..1 | date | When the research definition was last reviewed
| effectivePeriod | 0..1 | Period | When the research definition is expected to be used
| topic | 0..* | CodeableConcept | The category of the ResearchDefinition, such as Education, Treatment, Assessment, etc.
| author | 0..* | ContactDetail | Who authored the content
| editor | 0..* | ContactDetail | Who edited the content
| reviewer | 0..* | ContactDetail | Who reviewed the content
| endorser | 0..* | ContactDetail | Who endorsed the content
| relatedArtifact | 0..* | RelatedArtifact | Additional documentation, citations, etc.
| library | 0..* | canonical | Logic used by the ResearchDefinition
| population | 1..1 | Reference | What population?
| exposure | 0..1 | Reference | What exposure?
| exposureAlternative | 0..1 | Reference | What alternative exposure state?
| outcome | 0..1 | Reference | What outcome?

## Search Parameters

| Name | Type | Description | Expression
| --- | --- | --- | --- |
| composed-of | reference | What resource is being referenced | ResearchDefinition.relatedArtifact
| context | token | A use context assigned to the research definition | ResearchDefinition.useContext.value
| context-quantity | quantity | A quantity- or range-valued use context assigned to the research definition | ResearchDefinition.useContext.value
| context-type | token | A type of use context assigned to the research definition | ResearchDefinition.useContext.code
| date | date | The research definition publication date | ResearchDefinition.date
| depends-on | reference | What resource is being referenced | ResearchDefinition.relatedArtifact
| derived-from | reference | What resource is being referenced | ResearchDefinition.relatedArtifact
| description | string | The description of the research definition | ResearchDefinition.description
| effective | date | The time during which the research definition is intended to be in use | ResearchDefinition.effectivePeriod
| identifier | token | External identifier for the research definition | ResearchDefinition.identifier
| jurisdiction | token | Intended jurisdiction for the research definition | ResearchDefinition.jurisdiction
| name | string | Computationally friendly name of the research definition | ResearchDefinition.name
| predecessor | reference | What resource is being referenced | ResearchDefinition.relatedArtifact
| publisher | string | Name of the publisher of the research definition | ResearchDefinition.publisher
| status | token | The current status of the research definition | ResearchDefinition.status
| successor | reference | What resource is being referenced | ResearchDefinition.relatedArtifact
| title | string | The human-friendly name of the research definition | ResearchDefinition.title
| topic | token | Topics associated with the ResearchDefinition | ResearchDefinition.topic
| url | uri | The uri that identifies the research definition | ResearchDefinition.url
| version | token | The business version of the research definition | ResearchDefinition.version
| context-type-quantity | composite | A use context type and quantity- or range-based value assigned to the research definition | ResearchDefinition.useContext
| context-type-value | composite | A use context type and value assigned to the research definition | ResearchDefinition.useContext


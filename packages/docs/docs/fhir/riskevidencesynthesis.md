---
title: RiskEvidenceSynthesis
sidebar_position: 525
---

# RiskEvidenceSynthesis

The RiskEvidenceSynthesis resource describes the likelihood of an outcome in a population plus exposure state where the
  risk estimate is derived from a combination of research studies.

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
| url | 0..1 | uri | Canonical identifier for this risk evidence synthesis, represented as a URI (globally unique)
| identifier | 0..* | Identifier | Additional identifier for the risk evidence synthesis
| version | 0..1 | string | Business version of the risk evidence synthesis
| name | 0..1 | string | Name for this risk evidence synthesis (computer friendly)
| title | 0..1 | string | Name for this risk evidence synthesis (human friendly)
| status | 1..1 | code | draft \| active \| retired \| unknown
| date | 0..1 | dateTime | Date last changed
| publisher | 0..1 | string | Name of the publisher (organization or individual)
| contact | 0..* | ContactDetail | Contact details for the publisher
| description | 0..1 | markdown | Natural language description of the risk evidence synthesis
| note | 0..* | Annotation | Used for footnotes or explanatory notes
| useContext | 0..* | UsageContext | The context that the content is intended to support
| jurisdiction | 0..* | CodeableConcept | Intended jurisdiction for risk evidence synthesis (if applicable)
| copyright | 0..1 | markdown | Use and/or publishing restrictions
| approvalDate | 0..1 | date | When the risk evidence synthesis was approved by publisher
| lastReviewDate | 0..1 | date | When the risk evidence synthesis was last reviewed
| effectivePeriod | 0..1 | Period | When the risk evidence synthesis is expected to be used
| topic | 0..* | CodeableConcept | The category of the EffectEvidenceSynthesis, such as Education, Treatment, Assessment, etc.
| author | 0..* | ContactDetail | Who authored the content
| editor | 0..* | ContactDetail | Who edited the content
| reviewer | 0..* | ContactDetail | Who reviewed the content
| endorser | 0..* | ContactDetail | Who endorsed the content
| relatedArtifact | 0..* | RelatedArtifact | Additional documentation, citations, etc.
| synthesisType | 0..1 | CodeableConcept | Type of synthesis
| studyType | 0..1 | CodeableConcept | Type of study
| population | 1..1 | Reference | What population?
| exposure | 0..1 | Reference | What exposure?
| outcome | 1..1 | Reference | What outcome?
| sampleSize | 0..1 | BackboneElement | What sample size was involved?
| riskEstimate | 0..1 | BackboneElement | What was the estimated risk
| certainty | 0..* | BackboneElement | How certain is the risk

## Search Parameters

| Name | Type | Description | Expression
| --- | --- | --- | --- |
| context | token | A use context assigned to the risk evidence synthesis | RiskEvidenceSynthesis.useContext.value
| context-quantity | quantity | A quantity- or range-valued use context assigned to the risk evidence synthesis | RiskEvidenceSynthesis.useContext.value
| context-type | token | A type of use context assigned to the risk evidence synthesis | RiskEvidenceSynthesis.useContext.code
| date | date | The risk evidence synthesis publication date | RiskEvidenceSynthesis.date
| description | string | The description of the risk evidence synthesis | RiskEvidenceSynthesis.description
| effective | date | The time during which the risk evidence synthesis is intended to be in use | RiskEvidenceSynthesis.effectivePeriod
| identifier | token | External identifier for the risk evidence synthesis | RiskEvidenceSynthesis.identifier
| jurisdiction | token | Intended jurisdiction for the risk evidence synthesis | RiskEvidenceSynthesis.jurisdiction
| name | string | Computationally friendly name of the risk evidence synthesis | RiskEvidenceSynthesis.name
| publisher | string | Name of the publisher of the risk evidence synthesis | RiskEvidenceSynthesis.publisher
| status | token | The current status of the risk evidence synthesis | RiskEvidenceSynthesis.status
| title | string | The human-friendly name of the risk evidence synthesis | RiskEvidenceSynthesis.title
| url | uri | The uri that identifies the risk evidence synthesis | RiskEvidenceSynthesis.url
| version | token | The business version of the risk evidence synthesis | RiskEvidenceSynthesis.version
| context-type-quantity | composite | A use context type and quantity- or range-based value assigned to the risk evidence synthesis | RiskEvidenceSynthesis.useContext
| context-type-value | composite | A use context type and value assigned to the risk evidence synthesis | RiskEvidenceSynthesis.useContext


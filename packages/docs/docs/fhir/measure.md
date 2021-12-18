---
title: Measure
sidebar_position: 355
---

# Measure

The Measure resource provides the definition of a quality measure.

## Properties

| Name                            | Card  | Type            | Description                                                                   |
| ------------------------------- | ----- | --------------- | ----------------------------------------------------------------------------- |
| id                              | 0..1  | string          | Logical id of this artifact                                                   |
| meta                            | 0..1  | Meta            | Metadata about the resource                                                   |
| implicitRules                   | 0..1  | uri             | A set of rules under which this content was created                           |
| language                        | 0..1  | code            | Language of the resource content                                              |
| text                            | 0..1  | Narrative       | Text summary of the resource, for human interpretation                        |
| contained                       | 0..\* | Resource        | Contained, inline Resources                                                   |
| extension                       | 0..\* | Extension       | Additional content defined by implementations                                 |
| modifierExtension               | 0..\* | Extension       | Extensions that cannot be ignored                                             |
| url                             | 0..1  | uri             | Canonical identifier for this measure, represented as a URI (globally unique) |
| identifier                      | 0..\* | Identifier      | Additional identifier for the measure                                         |
| version                         | 0..1  | string          | Business version of the measure                                               |
| name                            | 0..1  | string          | Name for this measure (computer friendly)                                     |
| title                           | 0..1  | string          | Name for this measure (human friendly)                                        |
| subtitle                        | 0..1  | string          | Subordinate title of the measure                                              |
| status                          | 1..1  | code            | draft \| active \| retired \| unknown                                         |
| experimental                    | 0..1  | boolean         | For testing purposes, not real usage                                          |
| subject[x]                      | 0..1  | CodeableConcept | E.g. Patient, Practitioner, RelatedPerson, Organization, Location, Device     |
| date                            | 0..1  | dateTime        | Date last changed                                                             |
| publisher                       | 0..1  | string          | Name of the publisher (organization or individual)                            |
| contact                         | 0..\* | ContactDetail   | Contact details for the publisher                                             |
| description                     | 0..1  | markdown        | Natural language description of the measure                                   |
| useContext                      | 0..\* | UsageContext    | The context that the content is intended to support                           |
| jurisdiction                    | 0..\* | CodeableConcept | Intended jurisdiction for measure (if applicable)                             |
| purpose                         | 0..1  | markdown        | Why this measure is defined                                                   |
| usage                           | 0..1  | string          | Describes the clinical usage of the measure                                   |
| copyright                       | 0..1  | markdown        | Use and/or publishing restrictions                                            |
| approvalDate                    | 0..1  | date            | When the measure was approved by publisher                                    |
| lastReviewDate                  | 0..1  | date            | When the measure was last reviewed                                            |
| effectivePeriod                 | 0..1  | Period          | When the measure is expected to be used                                       |
| topic                           | 0..\* | CodeableConcept | The category of the measure, such as Education, Treatment, Assessment, etc.   |
| author                          | 0..\* | ContactDetail   | Who authored the content                                                      |
| editor                          | 0..\* | ContactDetail   | Who edited the content                                                        |
| reviewer                        | 0..\* | ContactDetail   | Who reviewed the content                                                      |
| endorser                        | 0..\* | ContactDetail   | Who endorsed the content                                                      |
| relatedArtifact                 | 0..\* | RelatedArtifact | Additional documentation, citations, etc.                                     |
| library                         | 0..\* | canonical       | Logic used by the measure                                                     |
| disclaimer                      | 0..1  | markdown        | Disclaimer for use of the measure or its referenced content                   |
| scoring                         | 0..1  | CodeableConcept | proportion \| ratio \| continuous-variable \| cohort                          |
| compositeScoring                | 0..1  | CodeableConcept | opportunity \| all-or-nothing \| linear \| weighted                           |
| type                            | 0..\* | CodeableConcept | process \| outcome \| structure \| patient-reported-outcome \| composite      |
| riskAdjustment                  | 0..1  | string          | How risk adjustment is applied for this measure                               |
| rateAggregation                 | 0..1  | string          | How is rate aggregation performed for this measure                            |
| rationale                       | 0..1  | markdown        | Detailed description of why the measure exists                                |
| clinicalRecommendationStatement | 0..1  | markdown        | Summary of clinical guidelines                                                |
| improvementNotation             | 0..1  | CodeableConcept | increase \| decrease                                                          |
| definition                      | 0..\* | markdown        | Defined terms used in the measure documentation                               |
| guidance                        | 0..1  | markdown        | Additional guidance for implementers                                          |
| group                           | 0..\* | BackboneElement | Population criteria group                                                     |
| supplementalData                | 0..\* | BackboneElement | What other data should be reported with the measure                           |

## Search Parameters

| Name                  | Type      | Description                                                                   | Expression               |
| --------------------- | --------- | ----------------------------------------------------------------------------- | ------------------------ |
| composed-of           | reference | What resource is being referenced                                             | Measure.relatedArtifact  |
| context               | token     | A use context assigned to the measure                                         | Measure.useContext.value |
| context-quantity      | quantity  | A quantity- or range-valued use context assigned to the measure               | Measure.useContext.value |
| context-type          | token     | A type of use context assigned to the measure                                 | Measure.useContext.code  |
| date                  | date      | The measure publication date                                                  | Measure.date             |
| depends-on            | reference | What resource is being referenced                                             | Measure.relatedArtifact  |
| derived-from          | reference | What resource is being referenced                                             | Measure.relatedArtifact  |
| description           | string    | The description of the measure                                                | Measure.description      |
| effective             | date      | The time during which the measure is intended to be in use                    | Measure.effectivePeriod  |
| identifier            | token     | External identifier for the measure                                           | Measure.identifier       |
| jurisdiction          | token     | Intended jurisdiction for the measure                                         | Measure.jurisdiction     |
| name                  | string    | Computationally friendly name of the measure                                  | Measure.name             |
| predecessor           | reference | What resource is being referenced                                             | Measure.relatedArtifact  |
| publisher             | string    | Name of the publisher of the measure                                          | Measure.publisher        |
| status                | token     | The current status of the measure                                             | Measure.status           |
| successor             | reference | What resource is being referenced                                             | Measure.relatedArtifact  |
| title                 | string    | The human-friendly name of the measure                                        | Measure.title            |
| topic                 | token     | Topics associated with the measure                                            | Measure.topic            |
| url                   | uri       | The uri that identifies the measure                                           | Measure.url              |
| version               | token     | The business version of the measure                                           | Measure.version          |
| context-type-quantity | composite | A use context type and quantity- or range-based value assigned to the measure | Measure.useContext       |
| context-type-value    | composite | A use context type and value assigned to the measure                          | Measure.useContext       |

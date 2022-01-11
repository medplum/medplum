---
title: ImplementationGuide
sidebar_position: 321
---

# ImplementationGuide

A set of rules of how a particular interoperability or standards problem is solved - typically through the use of FHIR
resources. This resource is used to gather all the parts of an implementation guide into a logical whole and to publish
a computable definition of all the parts.

## Properties

| Name              | Card  | Type            | Description                                                                                |
| ----------------- | ----- | --------------- | ------------------------------------------------------------------------------------------ |
| id                | 0..1  | string          | Logical id of this artifact                                                                |
| meta              | 0..1  | Meta            | Metadata about the resource                                                                |
| implicitRules     | 0..1  | uri             | A set of rules under which this content was created                                        |
| language          | 0..1  | code            | Language of the resource content                                                           |
| text              | 0..1  | Narrative       | Text summary of the resource, for human interpretation                                     |
| contained         | 0..\* | Resource        | Contained, inline Resources                                                                |
| extension         | 0..\* | Extension       | Additional content defined by implementations                                              |
| modifierExtension | 0..\* | Extension       | Extensions that cannot be ignored                                                          |
| url               | 1..1  | uri             | Canonical identifier for this implementation guide, represented as a URI (globally unique) |
| version           | 0..1  | string          | Business version of the implementation guide                                               |
| name              | 1..1  | string          | Name for this implementation guide (computer friendly)                                     |
| title             | 0..1  | string          | Name for this implementation guide (human friendly)                                        |
| status            | 1..1  | code            | draft \| active \| retired \| unknown                                                      |
| experimental      | 0..1  | boolean         | For testing purposes, not real usage                                                       |
| date              | 0..1  | dateTime        | Date last changed                                                                          |
| publisher         | 0..1  | string          | Name of the publisher (organization or individual)                                         |
| contact           | 0..\* | ContactDetail   | Contact details for the publisher                                                          |
| description       | 0..1  | markdown        | Natural language description of the implementation guide                                   |
| useContext        | 0..\* | UsageContext    | The context that the content is intended to support                                        |
| jurisdiction      | 0..\* | CodeableConcept | Intended jurisdiction for implementation guide (if applicable)                             |
| copyright         | 0..1  | markdown        | Use and/or publishing restrictions                                                         |
| packageId         | 1..1  | id              | NPM Package name for IG                                                                    |
| license           | 0..1  | code            | SPDX license code for this IG (or not-open-source)                                         |
| fhirVersion       | 1..\* | code            | FHIR Version(s) this Implementation Guide targets                                          |
| dependsOn         | 0..\* | BackboneElement | Another Implementation guide this depends on                                               |
| global            | 0..\* | BackboneElement | Profiles that apply globally                                                               |
| definition        | 0..1  | BackboneElement | Information needed to build the IG                                                         |
| manifest          | 0..1  | BackboneElement | Information about an assembled IG                                                          |

## Search Parameters

| Name                  | Type      | Description                                                                                | Expression                                        |
| --------------------- | --------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------- |
| context               | token     | A use context assigned to the implementation guide                                         | ImplementationGuide.useContext.value              |
| context-quantity      | quantity  | A quantity- or range-valued use context assigned to the implementation guide               | ImplementationGuide.useContext.value              |
| context-type          | token     | A type of use context assigned to the implementation guide                                 | ImplementationGuide.useContext.code               |
| date                  | date      | The implementation guide publication date                                                  | ImplementationGuide.date                          |
| description           | string    | The description of the implementation guide                                                | ImplementationGuide.description                   |
| jurisdiction          | token     | Intended jurisdiction for the implementation guide                                         | ImplementationGuide.jurisdiction                  |
| name                  | string    | Computationally friendly name of the implementation guide                                  | ImplementationGuide.name                          |
| publisher             | string    | Name of the publisher of the implementation guide                                          | ImplementationGuide.publisher                     |
| status                | token     | The current status of the implementation guide                                             | ImplementationGuide.status                        |
| title                 | string    | The human-friendly name of the implementation guide                                        | ImplementationGuide.title                         |
| url                   | uri       | The uri that identifies the implementation guide                                           | ImplementationGuide.url                           |
| version               | token     | The business version of the implementation guide                                           | ImplementationGuide.version                       |
| context-type-quantity | composite | A use context type and quantity- or range-based value assigned to the implementation guide | ImplementationGuide.useContext                    |
| context-type-value    | composite | A use context type and value assigned to the implementation guide                          | ImplementationGuide.useContext                    |
| depends-on            | reference | Identity of the IG that this depends on                                                    | ImplementationGuide.dependsOn.uri                 |
| experimental          | token     | For testing purposes, not real usage                                                       | ImplementationGuide.experimental                  |
| global                | reference | Profile that all resources must conform to                                                 | ImplementationGuide.global.profile                |
| resource              | reference | Location of the resource                                                                   | ImplementationGuide.definition.resource.reference |

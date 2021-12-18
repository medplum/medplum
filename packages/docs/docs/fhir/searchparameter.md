---
title: SearchParameter
sidebar_position: 532
---

# SearchParameter

A search parameter that defines a named search item that can be used to search/filter on a resource.

## Properties

| Name              | Card  | Type            | Description                                                                                                   |
| ----------------- | ----- | --------------- | ------------------------------------------------------------------------------------------------------------- |
| id                | 0..1  | string          | Logical id of this artifact                                                                                   |
| meta              | 0..1  | Meta            | Metadata about the resource                                                                                   |
| implicitRules     | 0..1  | uri             | A set of rules under which this content was created                                                           |
| language          | 0..1  | code            | Language of the resource content                                                                              |
| text              | 0..1  | Narrative       | Text summary of the resource, for human interpretation                                                        |
| contained         | 0..\* | Resource        | Contained, inline Resources                                                                                   |
| extension         | 0..\* | Extension       | Additional content defined by implementations                                                                 |
| modifierExtension | 0..\* | Extension       | Extensions that cannot be ignored                                                                             |
| url               | 1..1  | uri             | Canonical identifier for this search parameter, represented as a URI (globally unique)                        |
| version           | 0..1  | string          | Business version of the search parameter                                                                      |
| name              | 1..1  | string          | Name for this search parameter (computer friendly)                                                            |
| derivedFrom       | 0..1  | canonical       | Original definition for the search parameter                                                                  |
| status            | 1..1  | code            | draft \| active \| retired \| unknown                                                                         |
| experimental      | 0..1  | boolean         | For testing purposes, not real usage                                                                          |
| date              | 0..1  | dateTime        | Date last changed                                                                                             |
| publisher         | 0..1  | string          | Name of the publisher (organization or individual)                                                            |
| contact           | 0..\* | ContactDetail   | Contact details for the publisher                                                                             |
| description       | 1..1  | markdown        | Natural language description of the search parameter                                                          |
| useContext        | 0..\* | UsageContext    | The context that the content is intended to support                                                           |
| jurisdiction      | 0..\* | CodeableConcept | Intended jurisdiction for search parameter (if applicable)                                                    |
| purpose           | 0..1  | markdown        | Why this search parameter is defined                                                                          |
| code              | 1..1  | code            | Code used in URL                                                                                              |
| base              | 1..\* | code            | The resource type(s) this search parameter applies to                                                         |
| type              | 1..1  | code            | number \| date \| string \| token \| reference \| composite \| quantity \| uri \| special                     |
| expression        | 0..1  | string          | FHIRPath expression that extracts the values                                                                  |
| xpath             | 0..1  | string          | XPath that extracts the values                                                                                |
| xpathUsage        | 0..1  | code            | normal \| phonetic \| nearby \| distance \| other                                                             |
| target            | 0..\* | code            | Types of resource (if a resource reference)                                                                   |
| multipleOr        | 0..1  | boolean         | Allow multiple values per parameter (or)                                                                      |
| multipleAnd       | 0..1  | boolean         | Allow multiple parameters (and)                                                                               |
| comparator        | 0..\* | code            | eq \| ne \| gt \| lt \| ge \| le \| sa \| eb \| ap                                                            |
| modifier          | 0..\* | code            | missing \| exact \| contains \| not \| text \| in \| not-in \| below \| above \| type \| identifier \| ofType |
| chain             | 0..\* | string          | Chained names supported                                                                                       |
| component         | 0..\* | BackboneElement | For Composite resources to define the parts                                                                   |

## Search Parameters

| Name                  | Type      | Description                                                                               | Expression                           |
| --------------------- | --------- | ----------------------------------------------------------------------------------------- | ------------------------------------ |
| context               | token     | A use context assigned to the search parameter                                            | SearchParameter.useContext.value     |
| context-quantity      | quantity  | A quantity- or range-valued use context assigned to the search parameter                  | SearchParameter.useContext.value     |
| context-type          | token     | A type of use context assigned to the search parameter                                    | SearchParameter.useContext.code      |
| date                  | date      | The search parameter publication date                                                     | SearchParameter.date                 |
| description           | string    | The description of the search parameter                                                   | SearchParameter.description          |
| jurisdiction          | token     | Intended jurisdiction for the search parameter                                            | SearchParameter.jurisdiction         |
| name                  | string    | Computationally friendly name of the search parameter                                     | SearchParameter.name                 |
| publisher             | string    | Name of the publisher of the search parameter                                             | SearchParameter.publisher            |
| status                | token     | The current status of the search parameter                                                | SearchParameter.status               |
| url                   | uri       | The uri that identifies the search parameter                                              | SearchParameter.url                  |
| version               | token     | The business version of the search parameter                                              | SearchParameter.version              |
| context-type-quantity | composite | A use context type and quantity- or range-based value assigned to the search parameter    | SearchParameter.useContext           |
| context-type-value    | composite | A use context type and value assigned to the search parameter                             | SearchParameter.useContext           |
| base                  | token     | The resource type(s) this search parameter applies to                                     | SearchParameter.base                 |
| code                  | token     | Code used in URL                                                                          | SearchParameter.code                 |
| component             | reference | Defines how the part works                                                                | SearchParameter.component.definition |
| derived-from          | reference | Original definition for the search parameter                                              | SearchParameter.derivedFrom          |
| target                | token     | Types of resource (if a resource reference)                                               | SearchParameter.target               |
| type                  | token     | number \| date \| string \| token \| reference \| composite \| quantity \| uri \| special | SearchParameter.type                 |

---
title: TestScript
sidebar_position: 629
---

# TestScript

A structured set of tests against a FHIR server or client implementation to determine compliance against the FHIR specification.

## Properties

| Name              | Card  | Type            | Description                                                                               |
| ----------------- | ----- | --------------- | ----------------------------------------------------------------------------------------- |
| id                | 0..1  | string          | Logical id of this artifact                                                               |
| meta              | 0..1  | Meta            | Metadata about the resource                                                               |
| implicitRules     | 0..1  | uri             | A set of rules under which this content was created                                       |
| language          | 0..1  | code            | Language of the resource content                                                          |
| text              | 0..1  | Narrative       | Text summary of the resource, for human interpretation                                    |
| contained         | 0..\* | Resource        | Contained, inline Resources                                                               |
| extension         | 0..\* | Extension       | Additional content defined by implementations                                             |
| modifierExtension | 0..\* | Extension       | Extensions that cannot be ignored                                                         |
| url               | 1..1  | uri             | Canonical identifier for this test script, represented as a URI (globally unique)         |
| identifier        | 0..1  | Identifier      | Additional identifier for the test script                                                 |
| version           | 0..1  | string          | Business version of the test script                                                       |
| name              | 1..1  | string          | Name for this test script (computer friendly)                                             |
| title             | 0..1  | string          | Name for this test script (human friendly)                                                |
| status            | 1..1  | code            | draft \| active \| retired \| unknown                                                     |
| experimental      | 0..1  | boolean         | For testing purposes, not real usage                                                      |
| date              | 0..1  | dateTime        | Date last changed                                                                         |
| publisher         | 0..1  | string          | Name of the publisher (organization or individual)                                        |
| contact           | 0..\* | ContactDetail   | Contact details for the publisher                                                         |
| description       | 0..1  | markdown        | Natural language description of the test script                                           |
| useContext        | 0..\* | UsageContext    | The context that the content is intended to support                                       |
| jurisdiction      | 0..\* | CodeableConcept | Intended jurisdiction for test script (if applicable)                                     |
| purpose           | 0..1  | markdown        | Why this test script is defined                                                           |
| copyright         | 0..1  | markdown        | Use and/or publishing restrictions                                                        |
| origin            | 0..\* | BackboneElement | An abstract server representing a client or sender in a message exchange                  |
| destination       | 0..\* | BackboneElement | An abstract server representing a destination or receiver in a message exchange           |
| metadata          | 0..1  | BackboneElement | Required capability that is assumed to function correctly on the FHIR server being tested |
| fixture           | 0..\* | BackboneElement | Fixture in the test script - by reference (uri)                                           |
| profile           | 0..\* | Reference       | Reference of the validation profile                                                       |
| variable          | 0..\* | BackboneElement | Placeholder for evaluated elements                                                        |
| setup             | 0..1  | BackboneElement | A series of required setup operations before tests are executed                           |
| test              | 0..\* | BackboneElement | A test in this script                                                                     |
| teardown          | 0..1  | BackboneElement | A series of required clean up steps                                                       |

## Search Parameters

| Name                  | Type      | Description                                                                       | Expression                                 |
| --------------------- | --------- | --------------------------------------------------------------------------------- | ------------------------------------------ |
| context               | token     | A use context assigned to the test script                                         | TestScript.useContext.value                |
| context-quantity      | quantity  | A quantity- or range-valued use context assigned to the test script               | TestScript.useContext.value                |
| context-type          | token     | A type of use context assigned to the test script                                 | TestScript.useContext.code                 |
| date                  | date      | The test script publication date                                                  | TestScript.date                            |
| description           | string    | The description of the test script                                                | TestScript.description                     |
| identifier            | token     | External identifier for the test script                                           | TestScript.identifier                      |
| jurisdiction          | token     | Intended jurisdiction for the test script                                         | TestScript.jurisdiction                    |
| name                  | string    | Computationally friendly name of the test script                                  | TestScript.name                            |
| publisher             | string    | Name of the publisher of the test script                                          | TestScript.publisher                       |
| status                | token     | The current status of the test script                                             | TestScript.status                          |
| testscript-capability | string    | TestScript required and validated capability                                      | TestScript.metadata.capability.description |
| title                 | string    | The human-friendly name of the test script                                        | TestScript.title                           |
| url                   | uri       | The uri that identifies the test script                                           | TestScript.url                             |
| version               | token     | The business version of the test script                                           | TestScript.version                         |
| context-type-quantity | composite | A use context type and quantity- or range-based value assigned to the test script | TestScript.useContext                      |
| context-type-value    | composite | A use context type and value assigned to the test script                          | TestScript.useContext                      |

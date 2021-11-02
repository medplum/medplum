---
title: ExampleScenario
sidebar_position: 261
---

# ExampleScenario

Example of workflow instance.

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
| url | 0..1 | uri | Canonical identifier for this example scenario, represented as a URI (globally unique)
| identifier | 0..* | Identifier | Additional identifier for the example scenario
| version | 0..1 | string | Business version of the example scenario
| name | 0..1 | string | Name for this example scenario (computer friendly)
| status | 1..1 | code | draft \| active \| retired \| unknown
| experimental | 0..1 | boolean | For testing purposes, not real usage
| date | 0..1 | dateTime | Date last changed
| publisher | 0..1 | string | Name of the publisher (organization or individual)
| contact | 0..* | ContactDetail | Contact details for the publisher
| useContext | 0..* | UsageContext | The context that the content is intended to support
| jurisdiction | 0..* | CodeableConcept | Intended jurisdiction for example scenario (if applicable)
| copyright | 0..1 | markdown | Use and/or publishing restrictions
| purpose | 0..1 | markdown | The purpose of the example, e.g. to illustrate a scenario
| actor | 0..* | BackboneElement | Actor participating in the resource
| instance | 0..* | BackboneElement | Each resource and each version that is present in the workflow
| process | 0..* | BackboneElement | Each major process - a group of operations
| workflow | 0..* | canonical | Another nested workflow

## Search Parameters

| Name | Type | Description | Expression
| --- | --- | --- | --- |
| context | token | A use context assigned to the example scenario | ExampleScenario.useContext.value
| context-quantity | quantity | A quantity- or range-valued use context assigned to the example scenario | ExampleScenario.useContext.value
| context-type | token | A type of use context assigned to the example scenario | ExampleScenario.useContext.code
| date | date | The example scenario publication date | ExampleScenario.date
| identifier | token | External identifier for the example scenario | ExampleScenario.identifier
| jurisdiction | token | Intended jurisdiction for the example scenario | ExampleScenario.jurisdiction
| name | string | Computationally friendly name of the example scenario | ExampleScenario.name
| publisher | string | Name of the publisher of the example scenario | ExampleScenario.publisher
| status | token | The current status of the example scenario | ExampleScenario.status
| url | uri | The uri that identifies the example scenario | ExampleScenario.url
| version | token | The business version of the example scenario | ExampleScenario.version
| context-type-quantity | composite | A use context type and quantity- or range-based value assigned to the example scenario | ExampleScenario.useContext
| context-type-value | composite | A use context type and value assigned to the example scenario | ExampleScenario.useContext


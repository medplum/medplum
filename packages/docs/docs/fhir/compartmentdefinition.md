---
title: CompartmentDefinition
sidebar_position: 156
---

# CompartmentDefinition

A compartment definition that defines how resources are accessed on a server.

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
| url | 1..1 | uri | Canonical identifier for this compartment definition, represented as a URI (globally unique)
| version | 0..1 | string | Business version of the compartment definition
| name | 1..1 | string | Name for this compartment definition (computer friendly)
| status | 1..1 | code | draft \| active \| retired \| unknown
| experimental | 0..1 | boolean | For testing purposes, not real usage
| date | 0..1 | dateTime | Date last changed
| publisher | 0..1 | string | Name of the publisher (organization or individual)
| contact | 0..* | ContactDetail | Contact details for the publisher
| description | 0..1 | markdown | Natural language description of the compartment definition
| useContext | 0..* | UsageContext | The context that the content is intended to support
| purpose | 0..1 | markdown | Why this compartment definition is defined
| code | 1..1 | code | Patient \| Encounter \| RelatedPerson \| Practitioner \| Device
| search | 1..1 | boolean | Whether the search syntax is supported
| resource | 0..* | BackboneElement | How a resource is related to the compartment

## Search Parameters

| Name | Type | Description | Expression
| --- | --- | --- | --- |
| context | token | A use context assigned to the compartment definition | CompartmentDefinition.useContext.value
| context-quantity | quantity | A quantity- or range-valued use context assigned to the compartment definition | CompartmentDefinition.useContext.value
| context-type | token | A type of use context assigned to the compartment definition | CompartmentDefinition.useContext.code
| date | date | The compartment definition publication date | CompartmentDefinition.date
| description | string | The description of the compartment definition | CompartmentDefinition.description
| name | string | Computationally friendly name of the compartment definition | CompartmentDefinition.name
| publisher | string | Name of the publisher of the compartment definition | CompartmentDefinition.publisher
| status | token | The current status of the compartment definition | CompartmentDefinition.status
| url | uri | The uri that identifies the compartment definition | CompartmentDefinition.url
| version | token | The business version of the compartment definition | CompartmentDefinition.version
| context-type-quantity | composite | A use context type and quantity- or range-based value assigned to the compartment definition | CompartmentDefinition.useContext
| context-type-value | composite | A use context type and value assigned to the compartment definition | CompartmentDefinition.useContext
| code | token | Patient \| Encounter \| RelatedPerson \| Practitioner \| Device | CompartmentDefinition.code
| resource | token | Name of resource type | CompartmentDefinition.resource.code


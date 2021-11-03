---
title: GraphDefinition
sidebar_position: 296
---

# GraphDefinition

A formal computable definition of a graph of resources - that is, a coherent set of resources that form a graph by
  following references. The Graph Definition resource defines a set and makes rules about the set.

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
| url | 0..1 | uri | Canonical identifier for this graph definition, represented as a URI (globally unique)
| version | 0..1 | string | Business version of the graph definition
| name | 1..1 | string | Name for this graph definition (computer friendly)
| status | 1..1 | code | draft \| active \| retired \| unknown
| experimental | 0..1 | boolean | For testing purposes, not real usage
| date | 0..1 | dateTime | Date last changed
| publisher | 0..1 | string | Name of the publisher (organization or individual)
| contact | 0..* | ContactDetail | Contact details for the publisher
| description | 0..1 | markdown | Natural language description of the graph definition
| useContext | 0..* | UsageContext | The context that the content is intended to support
| jurisdiction | 0..* | CodeableConcept | Intended jurisdiction for graph definition (if applicable)
| purpose | 0..1 | markdown | Why this graph definition is defined
| start | 1..1 | code | Type of resource at which the graph starts
| profile | 0..1 | canonical | Profile on base resource
| link | 0..* | BackboneElement | Links this graph makes rules about

## Search Parameters

| Name | Type | Description | Expression
| --- | --- | --- | --- |
| context | token | A use context assigned to the graph definition | GraphDefinition.useContext.value
| context-quantity | quantity | A quantity- or range-valued use context assigned to the graph definition | GraphDefinition.useContext.value
| context-type | token | A type of use context assigned to the graph definition | GraphDefinition.useContext.code
| date | date | The graph definition publication date | GraphDefinition.date
| description | string | The description of the graph definition | GraphDefinition.description
| jurisdiction | token | Intended jurisdiction for the graph definition | GraphDefinition.jurisdiction
| name | string | Computationally friendly name of the graph definition | GraphDefinition.name
| publisher | string | Name of the publisher of the graph definition | GraphDefinition.publisher
| status | token | The current status of the graph definition | GraphDefinition.status
| url | uri | The uri that identifies the graph definition | GraphDefinition.url
| version | token | The business version of the graph definition | GraphDefinition.version
| context-type-quantity | composite | A use context type and quantity- or range-based value assigned to the graph definition | GraphDefinition.useContext
| context-type-value | composite | A use context type and value assigned to the graph definition | GraphDefinition.useContext
| start | token | Type of resource at which the graph starts | GraphDefinition.start


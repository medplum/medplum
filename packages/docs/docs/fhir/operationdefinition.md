---
title: OperationDefinition
sidebar_position: 461
---

# OperationDefinition

A formal computable definition of an operation (on the RESTful interface) or a named query (using the search interaction).

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
| url | 0..1 | uri | Canonical identifier for this operation definition, represented as a URI (globally unique)
| version | 0..1 | string | Business version of the operation definition
| name | 1..1 | string | Name for this operation definition (computer friendly)
| title | 0..1 | string | Name for this operation definition (human friendly)
| status | 1..1 | code | draft \| active \| retired \| unknown
| kind | 1..1 | code | operation \| query
| experimental | 0..1 | boolean | For testing purposes, not real usage
| date | 0..1 | dateTime | Date last changed
| publisher | 0..1 | string | Name of the publisher (organization or individual)
| contact | 0..* | ContactDetail | Contact details for the publisher
| description | 0..1 | markdown | Natural language description of the operation definition
| useContext | 0..* | UsageContext | The context that the content is intended to support
| jurisdiction | 0..* | CodeableConcept | Intended jurisdiction for operation definition (if applicable)
| purpose | 0..1 | markdown | Why this operation definition is defined
| affectsState | 0..1 | boolean | Whether content is changed by the operation
| code | 1..1 | code | Name used to invoke the operation
| comment | 0..1 | markdown | Additional information about use
| base | 0..1 | canonical | Marks this as a profile of the base
| resource | 0..* | code | Types this operation applies to
| system | 1..1 | boolean | Invoke at the system level?
| type | 1..1 | boolean | Invoke at the type level?
| instance | 1..1 | boolean | Invoke on an instance?
| inputProfile | 0..1 | canonical | Validation information for in parameters
| outputProfile | 0..1 | canonical | Validation information for out parameters
| parameter | 0..* | BackboneElement | Parameters for the operation/query
| overload | 0..* | BackboneElement | Define overloaded variants for when  generating code

## Search Parameters

| Name | Type | Description | Expression
| --- | --- | --- | --- |
| context | token | A use context assigned to the operation definition | OperationDefinition.useContext.value
| context-quantity | quantity | A quantity- or range-valued use context assigned to the operation definition | OperationDefinition.useContext.value
| context-type | token | A type of use context assigned to the operation definition | OperationDefinition.useContext.code
| date | date | The operation definition publication date | OperationDefinition.date
| description | string | The description of the operation definition | OperationDefinition.description
| jurisdiction | token | Intended jurisdiction for the operation definition | OperationDefinition.jurisdiction
| name | string | Computationally friendly name of the operation definition | OperationDefinition.name
| publisher | string | Name of the publisher of the operation definition | OperationDefinition.publisher
| status | token | The current status of the operation definition | OperationDefinition.status
| title | string | The human-friendly name of the operation definition | OperationDefinition.title
| url | uri | The uri that identifies the operation definition | OperationDefinition.url
| version | token | The business version of the operation definition | OperationDefinition.version
| context-type-quantity | composite | A use context type and quantity- or range-based value assigned to the operation definition | OperationDefinition.useContext
| context-type-value | composite | A use context type and value assigned to the operation definition | OperationDefinition.useContext
| base | reference | Marks this as a profile of the base | OperationDefinition.base
| code | token | Name used to invoke the operation | OperationDefinition.code
| input-profile | reference | Validation information for in parameters | OperationDefinition.inputProfile
| instance | token | Invoke on an instance? | OperationDefinition.instance
| kind | token | operation \| query | OperationDefinition.kind
| output-profile | reference | Validation information for out parameters | OperationDefinition.outputProfile
| system | token | Invoke at the system level? | OperationDefinition.system
| type | token | Invoke at the type level? | OperationDefinition.type


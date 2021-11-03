---
title: TerminologyCapabilities
sidebar_position: 608
---

# TerminologyCapabilities

A TerminologyCapabilities resource documents a set of capabilities (behaviors) of a FHIR Terminology Server that may be
  used as a statement of actual server functionality or a statement of required or desired server implementation.

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
| url | 0..1 | uri | Canonical identifier for this terminology capabilities, represented as a URI (globally unique)
| version | 0..1 | string | Business version of the terminology capabilities
| name | 0..1 | string | Name for this terminology capabilities (computer friendly)
| title | 0..1 | string | Name for this terminology capabilities (human friendly)
| status | 1..1 | code | draft \| active \| retired \| unknown
| experimental | 0..1 | boolean | For testing purposes, not real usage
| date | 1..1 | dateTime | Date last changed
| publisher | 0..1 | string | Name of the publisher (organization or individual)
| contact | 0..* | ContactDetail | Contact details for the publisher
| description | 0..1 | markdown | Natural language description of the terminology capabilities
| useContext | 0..* | UsageContext | The context that the content is intended to support
| jurisdiction | 0..* | CodeableConcept | Intended jurisdiction for terminology capabilities (if applicable)
| purpose | 0..1 | markdown | Why this terminology capabilities is defined
| copyright | 0..1 | markdown | Use and/or publishing restrictions
| kind | 1..1 | code | instance \| capability \| requirements
| software | 0..1 | BackboneElement | Software that is covered by this terminology capability statement
| implementation | 0..1 | BackboneElement | If this describes a specific instance
| lockedDate | 0..1 | boolean | Whether lockedDate is supported
| codeSystem | 0..* | BackboneElement | A code system supported by the server
| expansion | 0..1 | BackboneElement | Information about the [ValueSet/$expand](valueset-operation-expand.html) operation
| codeSearch | 0..1 | code | explicit \| all
| validateCode | 0..1 | BackboneElement | Information about the [ValueSet/$validate-code](valueset-operation-validate-code.html) operation
| translation | 0..1 | BackboneElement | Information about the [ConceptMap/$translate](conceptmap-operation-translate.html) operation
| closure | 0..1 | BackboneElement | Information about the [ConceptMap/$closure](conceptmap-operation-closure.html) operation

## Search Parameters

| Name | Type | Description | Expression
| --- | --- | --- | --- |
| context | token | A use context assigned to the terminology capabilities | TerminologyCapabilities.useContext.value
| context-quantity | quantity | A quantity- or range-valued use context assigned to the terminology capabilities | TerminologyCapabilities.useContext.value
| context-type | token | A type of use context assigned to the terminology capabilities | TerminologyCapabilities.useContext.code
| date | date | The terminology capabilities publication date | TerminologyCapabilities.date
| description | string | The description of the terminology capabilities | TerminologyCapabilities.description
| jurisdiction | token | Intended jurisdiction for the terminology capabilities | TerminologyCapabilities.jurisdiction
| name | string | Computationally friendly name of the terminology capabilities | TerminologyCapabilities.name
| publisher | string | Name of the publisher of the terminology capabilities | TerminologyCapabilities.publisher
| status | token | The current status of the terminology capabilities | TerminologyCapabilities.status
| title | string | The human-friendly name of the terminology capabilities | TerminologyCapabilities.title
| url | uri | The uri that identifies the terminology capabilities | TerminologyCapabilities.url
| version | token | The business version of the terminology capabilities | TerminologyCapabilities.version
| context-type-quantity | composite | A use context type and quantity- or range-based value assigned to the terminology capabilities | TerminologyCapabilities.useContext
| context-type-value | composite | A use context type and value assigned to the terminology capabilities | TerminologyCapabilities.useContext


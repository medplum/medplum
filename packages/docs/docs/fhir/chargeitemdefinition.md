---
title: ChargeItemDefinition
sidebar_position: 114
---

# ChargeItemDefinition

The ChargeItemDefinition resource provides the properties that apply to the (billing) codes necessary to calculate costs
  and prices. The properties may differ largely depending on type and realm, therefore this resource gives only a rough
  structure and requires profiling for each type of billing code system.

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
| url | 1..1 | uri | Canonical identifier for this charge item definition, represented as a URI (globally unique)
| identifier | 0..* | Identifier | Additional identifier for the charge item definition
| version | 0..1 | string | Business version of the charge item definition
| title | 0..1 | string | Name for this charge item definition (human friendly)
| derivedFromUri | 0..* | uri | Underlying externally-defined charge item definition
| partOf | 0..* | canonical | A larger definition of which this particular definition is a component or step
| replaces | 0..* | canonical | Completed or terminated request(s) whose function is taken by this new request
| status | 1..1 | code | draft \| active \| retired \| unknown
| experimental | 0..1 | boolean | For testing purposes, not real usage
| date | 0..1 | dateTime | Date last changed
| publisher | 0..1 | string | Name of the publisher (organization or individual)
| contact | 0..* | ContactDetail | Contact details for the publisher
| description | 0..1 | markdown | Natural language description of the charge item definition
| useContext | 0..* | UsageContext | The context that the content is intended to support
| jurisdiction | 0..* | CodeableConcept | Intended jurisdiction for charge item definition (if applicable)
| copyright | 0..1 | markdown | Use and/or publishing restrictions
| approvalDate | 0..1 | date | When the charge item definition was approved by publisher
| lastReviewDate | 0..1 | date | When the charge item definition was last reviewed
| effectivePeriod | 0..1 | Period | When the charge item definition is expected to be used
| code | 0..1 | CodeableConcept | Billing codes or product types this definition applies to
| instance | 0..* | Reference | Instances this definition applies to
| applicability | 0..* | BackboneElement | Whether or not the billing code is applicable
| propertyGroup | 0..* | BackboneElement | Group of properties which are applicable under the same conditions

## Search Parameters

| Name | Type | Description | Expression
| --- | --- | --- | --- |
| context | token | A use context assigned to the charge item definition | ChargeItemDefinition.useContext.value
| context-quantity | quantity | A quantity- or range-valued use context assigned to the charge item definition | ChargeItemDefinition.useContext.value
| context-type | token | A type of use context assigned to the charge item definition | ChargeItemDefinition.useContext.code
| date | date | The charge item definition publication date | ChargeItemDefinition.date
| description | string | The description of the charge item definition | ChargeItemDefinition.description
| effective | date | The time during which the charge item definition is intended to be in use | ChargeItemDefinition.effectivePeriod
| identifier | token | External identifier for the charge item definition | ChargeItemDefinition.identifier
| jurisdiction | token | Intended jurisdiction for the charge item definition | ChargeItemDefinition.jurisdiction
| publisher | string | Name of the publisher of the charge item definition | ChargeItemDefinition.publisher
| status | token | The current status of the charge item definition | ChargeItemDefinition.status
| title | string | The human-friendly name of the charge item definition | ChargeItemDefinition.title
| url | uri | The uri that identifies the charge item definition | ChargeItemDefinition.url
| version | token | The business version of the charge item definition | ChargeItemDefinition.version
| context-type-quantity | composite | A use context type and quantity- or range-based value assigned to the charge item definition | ChargeItemDefinition.useContext
| context-type-value | composite | A use context type and value assigned to the charge item definition | ChargeItemDefinition.useContext


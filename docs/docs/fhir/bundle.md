---
title: Bundle
sidebar_position: 85
---

# Bundle

A container for a collection of resources.

## Properties

| Name | Card | Type | Description |
| --- | --- | --- | --- |
| id | 0..1 | string | Logical id of this artifact
| meta | 0..1 | Meta | Metadata about the resource
| implicitRules | 0..1 | uri | A set of rules under which this content was created
| language | 0..1 | code | Language of the resource content
| identifier | 0..1 | Identifier | Persistent identifier for the bundle
| type | 1..1 | code | document \| message \| transaction \| transaction-response \| batch \| batch-response \| history \| searchset \| collection
| timestamp | 0..1 | instant | When the bundle was assembled
| total | 0..1 | unsignedInt | If search, the total number of matches
| link | 0..* | BackboneElement | Links related to this Bundle
| entry | 0..* | BackboneElement | Entry in the bundle - will have a resource or information
| signature | 0..1 | Signature | Digital Signature

## Search Parameters

| Name | Type | Description | Expression
| --- | --- | --- | --- |
| composition | reference | The first resource in the bundle, if the bundle type is "document" - this is a composition, and this parameter provides access to search its contents | Bundle.entry[0].resource
| identifier | token | Persistent identifier for the bundle | Bundle.identifier
| message | reference | The first resource in the bundle, if the bundle type is "message" - this is a message header, and this parameter provides access to search its contents | Bundle.entry[0].resource
| timestamp | date | When the bundle was assembled | Bundle.timestamp
| type | token | document \| message \| transaction \| transaction-response \| batch \| batch-response \| history \| searchset \| collection | Bundle.type


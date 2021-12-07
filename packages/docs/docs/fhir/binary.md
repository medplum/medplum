---
title: Binary
sidebar_position: 78
---

# Binary

A resource that represents the data of a single raw artifact as digital content accessible in its native format.  A
  Binary resource can contain any content, whether text, image, pdf, zip archive, etc.

## Properties

| Name | Card | Type | Description |
| --- | --- | --- | --- |
| id | 0..1 | string | Logical id of this artifact
| meta | 0..1 | Meta | Metadata about the resource
| implicitRules | 0..1 | uri | A set of rules under which this content was created
| language | 0..1 | code | Language of the resource content
| contentType | 1..1 | code | MimeType of the binary content
| securityContext | 0..1 | Reference | Identifies another resource to use as proxy when enforcing access control
| data | 0..1 | base64Binary | The actual content
| url | 0..1 | url | Uri where the data can be found

## Search Parameters

| Name | Type | Description | Expression
| --- | --- | --- | --- |


---
title: Endpoint
sidebar_position: 251
---

# Endpoint

The technical details of an endpoint that can be used for electronic services, such as for web services providing XDS.b
  or a REST endpoint for another FHIR server. This may include any security context information.

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
| identifier | 0..* | Identifier | Identifies this endpoint across multiple systems
| status | 1..1 | code | active \| suspended \| error \| off \| entered-in-error \| test
| connectionType | 1..1 | Coding | Protocol/Profile/Standard to be used with this endpoint connection
| name | 0..1 | string | A name that this endpoint can be identified by
| managingOrganization | 0..1 | Reference | Organization that manages this endpoint (might not be the organization that exposes the endpoint)
| contact | 0..* | ContactPoint | Contact details for source (e.g. troubleshooting)
| period | 0..1 | Period | Interval the endpoint is expected to be operational
| payloadType | 1..* | CodeableConcept | The type of content that may be used at this endpoint (e.g. XDS Discharge summaries)
| payloadMimeType | 0..* | code | Mimetype to send. If not specified, the content could be anything (including no payload, if the connectionType defined this)
| address | 1..1 | url | The technical base address for connecting to this endpoint
| header | 0..* | string | Usage depends on the channel type

## Search Parameters

| Name | Type | Description | Expression
| --- | --- | --- | --- |
| connection-type | token | Protocol/Profile/Standard to be used with this endpoint connection | Endpoint.connectionType
| identifier | token | Identifies this endpoint across multiple systems | Endpoint.identifier
| name | string | A name that this endpoint can be identified by | Endpoint.name
| organization | reference | The organization that is managing the endpoint | Endpoint.managingOrganization
| payload-type | token | The type of content that may be used at this endpoint (e.g. XDS Discharge summaries) | Endpoint.payloadType
| status | token | The current status of the Endpoint (usually expected to be active) | Endpoint.status


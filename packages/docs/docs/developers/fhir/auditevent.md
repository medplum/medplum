---
title: AuditEvent
sidebar_position: 71
---

# AuditEvent

A record of an event made for purposes of maintaining a security log. Typical uses include detection of intrusion
attempts and monitoring for inappropriate usage.

## Properties

| Name              | Card  | Type            | Description                                            |
| ----------------- | ----- | --------------- | ------------------------------------------------------ |
| id                | 0..1  | string          | Logical id of this artifact                            |
| meta              | 0..1  | Meta            | Metadata about the resource                            |
| implicitRules     | 0..1  | uri             | A set of rules under which this content was created    |
| language          | 0..1  | code            | Language of the resource content                       |
| text              | 0..1  | Narrative       | Text summary of the resource, for human interpretation |
| contained         | 0..\* | Resource        | Contained, inline Resources                            |
| extension         | 0..\* | Extension       | Additional content defined by implementations          |
| modifierExtension | 0..\* | Extension       | Extensions that cannot be ignored                      |
| type              | 1..1  | Coding          | Type/identifier of event                               |
| subtype           | 0..\* | Coding          | More specific type/id for the event                    |
| action            | 0..1  | code            | Type of action performed during the event              |
| period            | 0..1  | Period          | When the activity occurred                             |
| recorded          | 1..1  | instant         | Time when the event was recorded                       |
| outcome           | 0..1  | code            | Whether the event succeeded or failed                  |
| outcomeDesc       | 0..1  | string          | Description of the event outcome                       |
| purposeOfEvent    | 0..\* | CodeableConcept | The purposeOfUse of the event                          |
| agent             | 1..\* | BackboneElement | Actor involved in the event                            |
| source            | 1..1  | BackboneElement | Audit Event Reporter                                   |
| entity            | 0..\* | BackboneElement | Data or objects used                                   |

## Search Parameters

| Name        | Type      | Description                                                | Expression                       |
| ----------- | --------- | ---------------------------------------------------------- | -------------------------------- |
| action      | token     | Type of action performed during the event                  | AuditEvent.action                |
| address     | string    | Identifier for the network access point of the user device | AuditEvent.agent.network.address |
| agent       | reference | Identifier of who                                          | AuditEvent.agent.who             |
| agent-name  | string    | Human friendly name for the agent                          | AuditEvent.agent.name            |
| agent-role  | token     | Agent role in the event                                    | AuditEvent.agent.role            |
| altid       | token     | Alternative User identity                                  | AuditEvent.agent.altId           |
| date        | date      | Time when the event was recorded                           | AuditEvent.recorded              |
| entity      | reference | Specific instance of resource                              | AuditEvent.entity.what           |
| entity-name | string    | Descriptor for entity                                      | AuditEvent.entity.name           |
| entity-role | token     | What role the entity played                                | AuditEvent.entity.role           |
| entity-type | token     | Type of entity involved                                    | AuditEvent.entity.type           |
| outcome     | token     | Whether the event succeeded or failed                      | AuditEvent.outcome               |
| patient     | reference | Identifier of who                                          | AuditEvent.agent.who             |
| policy      | uri       | Policy that authorized event                               | AuditEvent.agent.policy          |
| site        | token     | Logical source location within the enterprise              | AuditEvent.source.site           |
| source      | reference | The identity of source detecting the event                 | AuditEvent.source.observer       |
| subtype     | token     | More specific type/id for the event                        | AuditEvent.subtype               |
| type        | token     | Type/identifier of event                                   | AuditEvent.type                  |

---
title: CareTeam
sidebar_position: 108
---

# CareTeam

The Care Team includes all the people and organizations who plan to participate in the coordination and delivery of care for a patient.

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
| identifier | 0..* | Identifier | External Ids for this team
| status | 0..1 | code | proposed \| active \| suspended \| inactive \| entered-in-error
| category | 0..* | CodeableConcept | Type of team
| name | 0..1 | string | Name of the team, such as crisis assessment team
| subject | 0..1 | Reference | Who care team is for
| encounter | 0..1 | Reference | Encounter created as part of
| period | 0..1 | Period | Time period team covers
| participant | 0..* | BackboneElement | Members of the team
| reasonCode | 0..* | CodeableConcept | Why the care team exists
| reasonReference | 0..* | Reference | Why the care team exists
| managingOrganization | 0..* | Reference | Organization responsible for the care team
| telecom | 0..* | ContactPoint | A contact detail for the care team (that applies to all members)
| note | 0..* | Annotation | Comments made about the CareTeam

## Search Parameters

| Name | Type | Description | Expression
| --- | --- | --- | --- |
| date | date | Time period team covers | CareTeam.period
| identifier | token | External Ids for this team | CareTeam.identifier
| patient | reference | Who care team is for | CareTeam.subject
| category | token | Type of team | CareTeam.category
| encounter | reference | Encounter created as part of | CareTeam.encounter
| participant | reference | Who is involved | CareTeam.participant.member
| status | token | proposed \| active \| suspended \| inactive \| entered-in-error | CareTeam.status
| subject | reference | Who care team is for | CareTeam.subject


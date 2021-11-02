---
title: CarePlan
sidebar_position: 105
---

# CarePlan

Describes the intention of how one or more practitioners intend to deliver care for a particular patient, group or
  community for a period of time, possibly limited to care for a specific condition or set of conditions.

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
| identifier | 0..* | Identifier | External Ids for this plan
| instantiatesCanonical | 0..* | canonical | Instantiates FHIR protocol or definition
| instantiatesUri | 0..* | uri | Instantiates external protocol or definition
| basedOn | 0..* | Reference | Fulfills CarePlan
| replaces | 0..* | Reference | CarePlan replaced by this CarePlan
| partOf | 0..* | Reference | Part of referenced CarePlan
| status | 1..1 | code | draft \| active \| on-hold \| revoked \| completed \| entered-in-error \| unknown
| intent | 1..1 | code | proposal \| plan \| order \| option
| category | 0..* | CodeableConcept | Type of plan
| title | 0..1 | string | Human-friendly name for the care plan
| description | 0..1 | string | Summary of nature of plan
| subject | 1..1 | Reference | Who the care plan is for
| encounter | 0..1 | Reference | Encounter created as part of
| period | 0..1 | Period | Time period plan covers
| created | 0..1 | dateTime | Date record was first recorded
| author | 0..1 | Reference | Who is the designated responsible party
| contributor | 0..* | Reference | Who provided the content of the care plan
| careTeam | 0..* | Reference | Who's involved in plan?
| addresses | 0..* | Reference | Health issues this plan addresses
| supportingInfo | 0..* | Reference | Information considered as part of plan
| goal | 0..* | Reference | Desired outcome of plan
| activity | 0..* | BackboneElement | Action to occur as part of plan
| note | 0..* | Annotation | Comments about the plan

## Search Parameters

| Name | Type | Description | Expression
| --- | --- | --- | --- |
| date | date | Time period plan covers | CarePlan.period
| identifier | token | External Ids for this plan | CarePlan.identifier
| patient | reference | Who the care plan is for | CarePlan.subject
| activity-code | token | Detail type of activity | CarePlan.activity.detail.code
| activity-date | date | Specified date occurs within period specified by CarePlan.activity.detail.scheduled[x] | CarePlan.activity.detail.scheduled
| activity-reference | reference | Activity details defined in specific resource | CarePlan.activity.reference
| based-on | reference | Fulfills CarePlan | CarePlan.basedOn
| care-team | reference | Who's involved in plan? | CarePlan.careTeam
| category | token | Type of plan | CarePlan.category
| condition | reference | Health issues this plan addresses | CarePlan.addresses
| encounter | reference | Encounter created as part of | CarePlan.encounter
| goal | reference | Desired outcome of plan | CarePlan.goal
| instantiates-canonical | reference | Instantiates FHIR protocol or definition | CarePlan.instantiatesCanonical
| instantiates-uri | uri | Instantiates external protocol or definition | CarePlan.instantiatesUri
| intent | token | proposal \| plan \| order \| option | CarePlan.intent
| part-of | reference | Part of referenced CarePlan | CarePlan.partOf
| performer | reference | Matches if the practitioner is listed as a performer in any of the "simple" activities.  (For performers of the detailed activities, chain through the activitydetail search parameter.) | CarePlan.activity.detail.performer
| replaces | reference | CarePlan replaced by this CarePlan | CarePlan.replaces
| status | token | draft \| active \| on-hold \| revoked \| completed \| entered-in-error \| unknown | CarePlan.status
| subject | reference | Who the care plan is for | CarePlan.subject


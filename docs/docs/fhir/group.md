---
title: Group
sidebar_position: 300
---

# Group

Represents a defined collection of entities that may be discussed or acted upon collectively but which are not expected
  to act collectively, and are not formally or legally recognized; i.e. a collection of entities that isn't an
  Organization.

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
| identifier | 0..* | Identifier | Unique id
| active | 0..1 | boolean | Whether this group's record is in active use
| type | 1..1 | code | person \| animal \| practitioner \| device \| medication \| substance
| actual | 1..1 | boolean | Descriptive or actual
| code | 0..1 | CodeableConcept | Kind of Group members
| name | 0..1 | string | Label for Group
| quantity | 0..1 | unsignedInt | Number of members
| managingEntity | 0..1 | Reference | Entity that is the custodian of the Group's definition
| characteristic | 0..* | BackboneElement | Include / Exclude group members by Trait
| member | 0..* | BackboneElement | Who or what is in group

## Search Parameters

| Name | Type | Description | Expression
| --- | --- | --- | --- |
| actual | token | Descriptive or actual | Group.actual
| characteristic | token | Kind of characteristic | Group.characteristic.code
| code | token | The kind of resources contained | Group.code
| exclude | token | Group includes or excludes | Group.characteristic.exclude
| identifier | token | Unique id | Group.identifier
| managing-entity | reference | Entity that is the custodian of the Group's definition | Group.managingEntity
| member | reference | Reference to the group member | Group.member.entity
| type | token | The type of resources the group contains | Group.type
| value | token | Value held by characteristic | Group.characteristic.value
| characteristic-value | composite | A composite of both characteristic and value | Group.characteristic


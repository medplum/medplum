---
title: DeviceMetric
sidebar_position: 224
---

# DeviceMetric

Describes a measurement, calculation or setting capability of a medical device.

## Properties

| Name              | Card  | Type            | Description                                                                              |
| ----------------- | ----- | --------------- | ---------------------------------------------------------------------------------------- |
| id                | 0..1  | string          | Logical id of this artifact                                                              |
| meta              | 0..1  | Meta            | Metadata about the resource                                                              |
| implicitRules     | 0..1  | uri             | A set of rules under which this content was created                                      |
| language          | 0..1  | code            | Language of the resource content                                                         |
| text              | 0..1  | Narrative       | Text summary of the resource, for human interpretation                                   |
| contained         | 0..\* | Resource        | Contained, inline Resources                                                              |
| extension         | 0..\* | Extension       | Additional content defined by implementations                                            |
| modifierExtension | 0..\* | Extension       | Extensions that cannot be ignored                                                        |
| identifier        | 0..\* | Identifier      | Instance identifier                                                                      |
| type              | 1..1  | CodeableConcept | Identity of metric, for example Heart Rate or PEEP Setting                               |
| unit              | 0..1  | CodeableConcept | Unit of Measure for the Metric                                                           |
| source            | 0..1  | Reference       | Describes the link to the source Device                                                  |
| parent            | 0..1  | Reference       | Describes the link to the parent Device                                                  |
| operationalStatus | 0..1  | code            | on \| off \| standby \| entered-in-error                                                 |
| color             | 0..1  | code            | black \| red \| green \| yellow \| blue \| magenta \| cyan \| white                      |
| category          | 1..1  | code            | measurement \| setting \| calculation \| unspecified                                     |
| measurementPeriod | 0..1  | Timing          | Describes the measurement repetition time                                                |
| calibration       | 0..\* | BackboneElement | Describes the calibrations that have been performed or that are required to be performed |

## Search Parameters

| Name       | Type      | Description                      | Expression              |
| ---------- | --------- | -------------------------------- | ----------------------- |
| category   | token     | The category of the metric       | DeviceMetric.category   |
| identifier | token     | The identifier of the metric     | DeviceMetric.identifier |
| parent     | reference | The parent DeviceMetric resource | DeviceMetric.parent     |
| source     | reference | The device resource              | DeviceMetric.source     |
| type       | token     | The component type               | DeviceMetric.type       |

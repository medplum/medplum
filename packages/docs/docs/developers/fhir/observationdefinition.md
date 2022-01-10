---
title: ObservationDefinition
sidebar_position: 458
---

# ObservationDefinition

Set of definitional characteristics for a kind of observation or measurement produced or consumed by an orderable health care service.

## Properties

| Name                   | Card  | Type            | Description                                                                                                                |
| ---------------------- | ----- | --------------- | -------------------------------------------------------------------------------------------------------------------------- |
| id                     | 0..1  | string          | Logical id of this artifact                                                                                                |
| meta                   | 0..1  | Meta            | Metadata about the resource                                                                                                |
| implicitRules          | 0..1  | uri             | A set of rules under which this content was created                                                                        |
| language               | 0..1  | code            | Language of the resource content                                                                                           |
| text                   | 0..1  | Narrative       | Text summary of the resource, for human interpretation                                                                     |
| contained              | 0..\* | Resource        | Contained, inline Resources                                                                                                |
| extension              | 0..\* | Extension       | Additional content defined by implementations                                                                              |
| modifierExtension      | 0..\* | Extension       | Extensions that cannot be ignored                                                                                          |
| category               | 0..\* | CodeableConcept | Category of observation                                                                                                    |
| code                   | 1..1  | CodeableConcept | Type of observation (code / type)                                                                                          |
| identifier             | 0..\* | Identifier      | Business identifier for this ObservationDefinition instance                                                                |
| permittedDataType      | 0..\* | code            | Quantity \| CodeableConcept \| string \| boolean \| integer \| Range \| Ratio \| SampledData \| time \| dateTime \| Period |
| multipleResultsAllowed | 0..1  | boolean         | Multiple results allowed                                                                                                   |
| method                 | 0..1  | CodeableConcept | Method used to produce the observation                                                                                     |
| preferredReportName    | 0..1  | string          | Preferred report name                                                                                                      |
| quantitativeDetails    | 0..1  | BackboneElement | Characteristics of quantitative results                                                                                    |
| qualifiedInterval      | 0..\* | BackboneElement | Qualified range for continuous and ordinal observation results                                                             |
| validCodedValueSet     | 0..1  | Reference       | Value set of valid coded values for the observations conforming to this ObservationDefinition                              |
| normalCodedValueSet    | 0..1  | Reference       | Value set of normal coded values for the observations conforming to this ObservationDefinition                             |
| abnormalCodedValueSet  | 0..1  | Reference       | Value set of abnormal coded values for the observations conforming to this ObservationDefinition                           |
| criticalCodedValueSet  | 0..1  | Reference       | Value set of critical coded values for the observations conforming to this ObservationDefinition                           |

## Search Parameters

| Name | Type | Description | Expression |
| ---- | ---- | ----------- | ---------- |

---
title: MeasureReport
sidebar_position: 361
---

# MeasureReport

The MeasureReport resource contains the results of the calculation of a measure; and optionally a reference to the resources involved in that calculation.

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
| identifier | 0..* | Identifier | Additional identifier for the MeasureReport
| status | 1..1 | code | complete \| pending \| error
| type | 1..1 | code | individual \| subject-list \| summary \| data-collection
| measure | 1..1 | canonical | What measure was calculated
| subject | 0..1 | Reference | What individual(s) the report is for
| date | 0..1 | dateTime | When the report was generated
| reporter | 0..1 | Reference | Who is reporting the data
| period | 1..1 | Period | What period the report covers
| improvementNotation | 0..1 | CodeableConcept | increase \| decrease
| group | 0..* | BackboneElement | Measure results for each group
| evaluatedResource | 0..* | Reference | What data was used to calculate the measure score

## Search Parameters

| Name | Type | Description | Expression
| --- | --- | --- | --- |
| date | date | The date of the measure report | MeasureReport.date
| evaluated-resource | reference | An evaluated resource referenced by the measure report | MeasureReport.evaluatedResource
| identifier | token | External identifier of the measure report to be returned | MeasureReport.identifier
| measure | reference | The measure to return measure report results for | MeasureReport.measure
| patient | reference | The identity of a patient to search for individual measure report results for | MeasureReport.subject
| period | date | The period of the measure report | MeasureReport.period
| reporter | reference | The reporter to return measure report results for | MeasureReport.reporter
| status | token | The status of the measure report | MeasureReport.status
| subject | reference | The identity of a subject to search for individual measure report results for | MeasureReport.subject


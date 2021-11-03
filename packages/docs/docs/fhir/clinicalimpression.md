---
title: ClinicalImpression
sidebar_position: 143
---

# ClinicalImpression

A record of a clinical assessment performed to determine what problem(s) may affect the patient and before planning the
  treatments or management strategies that are best to manage a patient's condition. Assessments are often 1:1 with a
  clinical consultation / encounter,  but this varies greatly depending on the clinical workflow. This resource is called
  "ClinicalImpression" rather than "ClinicalAssessment" to avoid confusion with the recording of assessment tools such as
  Apgar score.

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
| identifier | 0..* | Identifier | Business identifier
| status | 1..1 | code | in-progress \| completed \| entered-in-error
| statusReason | 0..1 | CodeableConcept | Reason for current status
| code | 0..1 | CodeableConcept | Kind of assessment performed
| description | 0..1 | string | Why/how the assessment was performed
| subject | 1..1 | Reference | Patient or group assessed
| encounter | 0..1 | Reference | Encounter created as part of
| effective[x] | 0..1 | dateTime | Time of assessment
| date | 0..1 | dateTime | When the assessment was documented
| assessor | 0..1 | Reference | The clinician performing the assessment
| previous | 0..1 | Reference | Reference to last assessment
| problem | 0..* | Reference | Relevant impressions of patient state
| investigation | 0..* | BackboneElement | One or more sets of investigations (signs, symptoms, etc.)
| protocol | 0..* | uri | Clinical Protocol followed
| summary | 0..1 | string | Summary of the assessment
| finding | 0..* | BackboneElement | Possible or likely findings and diagnoses
| prognosisCodeableConcept | 0..* | CodeableConcept | Estimate of likely outcome
| prognosisReference | 0..* | Reference | RiskAssessment expressing likely outcome
| supportingInfo | 0..* | Reference | Information supporting the clinical impression
| note | 0..* | Annotation | Comments made about the ClinicalImpression

## Search Parameters

| Name | Type | Description | Expression
| --- | --- | --- | --- |
| date | date | When the assessment was documented | ClinicalImpression.date
| patient | reference | Patient or group assessed | ClinicalImpression.subject
| assessor | reference | The clinician performing the assessment | ClinicalImpression.assessor
| encounter | reference | Encounter created as part of | ClinicalImpression.encounter
| finding-code | token | What was found | ClinicalImpression.finding.itemCodeableConcept
| finding-ref | reference | What was found | ClinicalImpression.finding.itemReference
| identifier | token | Business identifier | ClinicalImpression.identifier
| investigation | reference | Record of a specific investigation | ClinicalImpression.investigation.item
| previous | reference | Reference to last assessment | ClinicalImpression.previous
| problem | reference | Relevant impressions of patient state | ClinicalImpression.problem
| status | token | in-progress \| completed \| entered-in-error | ClinicalImpression.status
| subject | reference | Patient or group assessed | ClinicalImpression.subject
| supporting-info | reference | Information supporting the clinical impression | ClinicalImpression.supportingInfo


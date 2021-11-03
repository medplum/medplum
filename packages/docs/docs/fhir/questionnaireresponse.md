---
title: QuestionnaireResponse
sidebar_position: 507
---

# QuestionnaireResponse

A structured set of questions and their answers. The questions are ordered and grouped into coherent subsets,
  corresponding to the structure of the grouping of the questionnaire being responded to.

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
| identifier | 0..1 | Identifier | Unique id for this set of answers
| basedOn | 0..* | Reference | Request fulfilled by this QuestionnaireResponse
| partOf | 0..* | Reference | Part of this action
| questionnaire | 0..1 | canonical | Form being answered
| status | 1..1 | code | in-progress \| completed \| amended \| entered-in-error \| stopped
| subject | 0..1 | Reference | The subject of the questions
| encounter | 0..1 | Reference | Encounter created as part of
| authored | 0..1 | dateTime | Date the answers were gathered
| author | 0..1 | Reference | Person who received and recorded the answers
| source | 0..1 | Reference | The person who answered the questions
| item | 0..* | BackboneElement | Groups and questions

## Search Parameters

| Name | Type | Description | Expression
| --- | --- | --- | --- |
| author | reference | The author of the questionnaire response | QuestionnaireResponse.author
| authored | date | When the questionnaire response was last changed | QuestionnaireResponse.authored
| based-on | reference | Plan/proposal/order fulfilled by this questionnaire response | QuestionnaireResponse.basedOn
| encounter | reference | Encounter associated with the questionnaire response | QuestionnaireResponse.encounter
| identifier | token | The unique identifier for the questionnaire response | QuestionnaireResponse.identifier
| part-of | reference | Procedure or observation this questionnaire response was performed as a part of | QuestionnaireResponse.partOf
| patient | reference | The patient that is the subject of the questionnaire response | QuestionnaireResponse.subject
| questionnaire | reference | The questionnaire the answers are provided for | QuestionnaireResponse.questionnaire
| source | reference | The individual providing the information reflected in the questionnaire respose | QuestionnaireResponse.source
| status | token | The status of the questionnaire response | QuestionnaireResponse.status
| subject | reference | The subject of the questionnaire response | QuestionnaireResponse.subject


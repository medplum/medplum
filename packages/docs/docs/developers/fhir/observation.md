---
title: Observation
sidebar_position: 455
---

# Observation

Measurements and simple assertions made about a patient, device or other subject.

## Properties

| Name              | Card  | Type            | Description                                                               |
| ----------------- | ----- | --------------- | ------------------------------------------------------------------------- |
| id                | 0..1  | string          | Logical id of this artifact                                               |
| meta              | 0..1  | Meta            | Metadata about the resource                                               |
| implicitRules     | 0..1  | uri             | A set of rules under which this content was created                       |
| language          | 0..1  | code            | Language of the resource content                                          |
| text              | 0..1  | Narrative       | Text summary of the resource, for human interpretation                    |
| contained         | 0..\* | Resource        | Contained, inline Resources                                               |
| extension         | 0..\* | Extension       | Additional content defined by implementations                             |
| modifierExtension | 0..\* | Extension       | Extensions that cannot be ignored                                         |
| identifier        | 0..\* | Identifier      | Business Identifier for observation                                       |
| basedOn           | 0..\* | Reference       | Fulfills plan, proposal or order                                          |
| partOf            | 0..\* | Reference       | Part of referenced event                                                  |
| status            | 1..1  | code            | registered \| preliminary \| final \| amended +                           |
| category          | 0..\* | CodeableConcept | Classification of type of observation                                     |
| code              | 1..1  | CodeableConcept | Type of observation (code / type)                                         |
| subject           | 0..1  | Reference       | Who and/or what the observation is about                                  |
| focus             | 0..\* | Reference       | What the observation is about, when it is not about the subject of record |
| encounter         | 0..1  | Reference       | Healthcare event during which this observation is made                    |
| effective[x]      | 0..1  | dateTime        | Clinically relevant time/time-period for observation                      |
| issued            | 0..1  | instant         | Date/Time this version was made available                                 |
| performer         | 0..\* | Reference       | Who is responsible for the observation                                    |
| value[x]          | 0..1  | Quantity        | Actual result                                                             |
| dataAbsentReason  | 0..1  | CodeableConcept | Why the result is missing                                                 |
| interpretation    | 0..\* | CodeableConcept | High, low, normal, etc.                                                   |
| note              | 0..\* | Annotation      | Comments about the observation                                            |
| bodySite          | 0..1  | CodeableConcept | Observed body part                                                        |
| method            | 0..1  | CodeableConcept | How it was done                                                           |
| specimen          | 0..1  | Reference       | Specimen used for this observation                                        |
| device            | 0..1  | Reference       | (Measurement) Device                                                      |
| referenceRange    | 0..\* | BackboneElement | Provides guide for interpretation                                         |
| hasMember         | 0..\* | Reference       | Related resource that belongs to the Observation group                    |
| derivedFrom       | 0..\* | Reference       | Related measurements the observation is made from                         |
| component         | 0..\* | BackboneElement | Component results                                                         |

## Search Parameters

| Name                          | Type      | Description                                                                                                                                             | Expression                             |
| ----------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| code                          | token     | The code of the observation type                                                                                                                        | Observation.code                       |
| date                          | date      | Obtained date/time. If the obtained element is a period, a date that falls in the period                                                                | Observation.effective                  |
| identifier                    | token     | The unique id for a particular observation                                                                                                              | Observation.identifier                 |
| patient                       | reference | The subject that the observation is about (if patient)                                                                                                  | Observation.subject                    |
| encounter                     | reference | Encounter related to the observation                                                                                                                    | Observation.encounter                  |
| based-on                      | reference | Reference to the service request.                                                                                                                       | Observation.basedOn                    |
| category                      | token     | The classification of the type of observation                                                                                                           | Observation.category                   |
| combo-code                    | token     | The code of the observation type or component type                                                                                                      | Observation.code                       |
| combo-data-absent-reason      | token     | The reason why the expected value in the element Observation.value[x] or Observation.component.value[x] is missing.                                     | Observation.dataAbsentReason           |
| combo-value-concept           | token     | The value or component value of the observation, if the value is a CodeableConcept                                                                      | Observation.value                      |
| combo-value-quantity          | quantity  | The value or component value of the observation, if the value is a Quantity, or a SampledData (just search on the bounds of the values in sampled data) | Observation.value                      |
| component-code                | token     | The component code of the observation type                                                                                                              | Observation.component.code             |
| component-data-absent-reason  | token     | The reason why the expected value in the element Observation.component.value[x] is missing.                                                             | Observation.component.dataAbsentReason |
| component-value-concept       | token     | The value of the component observation, if the value is a CodeableConcept                                                                               | Observation.component.value            |
| component-value-quantity      | quantity  | The value of the component observation, if the value is a Quantity, or a SampledData (just search on the bounds of the values in sampled data)          | Observation.component.value            |
| data-absent-reason            | token     | The reason why the expected value in the element Observation.value[x] is missing.                                                                       | Observation.dataAbsentReason           |
| derived-from                  | reference | Related measurements the observation is made from                                                                                                       | Observation.derivedFrom                |
| device                        | reference | The Device that generated the observation data.                                                                                                         | Observation.device                     |
| focus                         | reference | The focus of an observation when the focus is not the patient of record.                                                                                | Observation.focus                      |
| has-member                    | reference | Related resource that belongs to the Observation group                                                                                                  | Observation.hasMember                  |
| method                        | token     | The method used for the observation                                                                                                                     | Observation.method                     |
| part-of                       | reference | Part of referenced event                                                                                                                                | Observation.partOf                     |
| performer                     | reference | Who performed the observation                                                                                                                           | Observation.performer                  |
| specimen                      | reference | Specimen used for this observation                                                                                                                      | Observation.specimen                   |
| status                        | token     | The status of the observation                                                                                                                           | Observation.status                     |
| subject                       | reference | The subject that the observation is about                                                                                                               | Observation.subject                    |
| value-concept                 | token     | The value of the observation, if the value is a CodeableConcept                                                                                         | Observation.value                      |
| value-date                    | date      | The value of the observation, if the value is a date or period of time                                                                                  | Observation.value                      |
| value-quantity                | quantity  | The value of the observation, if the value is a Quantity, or a SampledData (just search on the bounds of the values in sampled data)                    | Observation.value                      |
| value-string                  | string    | The value of the observation, if the value is a string, and also searches in CodeableConcept.text                                                       | Observation.value                      |
| code-value-concept            | composite | Code and coded value parameter pair                                                                                                                     |
| code-value-date               | composite | Code and date/time value parameter pair                                                                                                                 |
| code-value-quantity           | composite | Code and quantity value parameter pair                                                                                                                  |
| code-value-string             | composite | Code and string value parameter pair                                                                                                                    |
| combo-code-value-concept      | composite | Code and coded value parameter pair, including in components                                                                                            | Observation.component                  |
| combo-code-value-quantity     | composite | Code and quantity value parameter pair, including in components                                                                                         | Observation.component                  |
| component-code-value-concept  | composite | Component code and component coded value parameter pair                                                                                                 | Observation.component                  |
| component-code-value-quantity | composite | Component code and component quantity value parameter pair                                                                                              | Observation.component                  |

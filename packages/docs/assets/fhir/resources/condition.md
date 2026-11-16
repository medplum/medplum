Refer to the [US Core Condition profile](https://hl7.org/fhir/us/core/stu3.1.1/StructureDefinition-us-core-condition.html) and the US Core [Condition Encounter](http://hl7.org/fhir/us/core/StructureDefinition-us-core-condition-encounter-diagnosis.html) profile.

## Usage

Condition is one of the [event](https://www.hl7.org/fhir/workflow.html#event) resources in the FHIR [workflow](https://www.hl7.org/fhir/workflow.html) specification.

This resource is used to record detailed information about a condition, problem, diagnosis, or other event, situation, issue, or clinical concept that has risen to a level of concern. The condition could be a point in time diagnosis in context of an encounter, it could be an item on the practitioner’s Problem [List](/docs/api/fhir/resources/list), or it could be a concern that doesn’t exist on the practitioner’s Problem [List](/docs/api/fhir/resources/list). Often times, a condition is about a clinician's assessment and assertion of a particular aspect of a patient's state of health. It can be used to record information about a disease/illness identified from application of clinical reasoning over the pathologic and pathophysiologic findings (diagnosis), or identification of health issues/situations that a practitioner considers harmful, potentially harmful and may be investigated and managed (problem), or other health issue/situation that may require ongoing monitoring and/or management (health issue/concern).

The condition resource may be used to record a certain health state of a patient which does not normally present a negative outcome, e.g. pregnancy. The condition resource may be used to record a condition following a procedure, such as the condition of Amputee-BKA following an amputation procedure.

While conditions are frequently a result of a clinician's assessment and assertion of a particular aspect of a patient's state of health, conditions can also be expressed by the patient, related person, or any care team member. A clinician may have a concern about a patient condition (e.g. anorexia) that the patient is not concerned about. Likewise, the patient may have a condition (e.g. hair loss) that does not rise to the level of importance such that it belongs on a practitioner’s Problem [List](/docs/api/fhir/resources/list).

For example, each of the following conditions could rise to the level of importance such that it belongs on a problem or concern list due to its direct or indirect impact on the patient’s health. These examples may also be represented using other resources, such as [FamilyMemberHistory](/docs/api/fhir/resources/familymemberhistory), [Observation](/docs/api/fhir/resources/observation), or [Procedure](/docs/api/fhir/resources/procedure).

- Unemployed
- Without transportation (or other barriers)
- Susceptibility to falls
- Exposure to communicable disease
- Family History of cardiovascular disease
- Fear of cancer
- Cardiac pacemaker
- Amputee-BKA
- Risk of Zika virus following travel to a country
- Former smoker
- Travel to a country planned (that warrants immunizations)
- Motor Vehicle Accident
- Patient has had coronary bypass graft

## Relationships

The condition resource may be referenced by other resources as "reasons" for an action (e.g. [MedicationRequest](/docs/api/fhir/resources/medicationrequest), [Procedure](/docs/api/fhir/resources/procedure), [ServiceRequest](/docs/api/fhir/resources/servicerequest), etc.)

This resource is not typically used to record information about subjective and objective information that might lead to the recording of a [Condition](/docs/api/fhir/resources/condition) resource. Such signs and symptoms are typically captured using the [Observation](/docs/api/fhir/resources/observation) resource; although in some cases a persistent symptom, e.g. fever, headache may be captured as a condition before a definitive diagnosis can be discerned by a clinician. By contrast, headache may be captured as an [Observation](/docs/api/fhir/resources/observation) when it contributes to the establishment of a meningitis [Condition](/docs/api/fhir/resources/condition).

Use the [Observation](/docs/api/fhir/resources/observation) resource when a symptom is resolved without long term management, tracking, or when a symptom contributes to the establishment of a condition.

Use [Condition](/docs/api/fhir/resources/condition) when a symptom requires long term management, tracking, or is used as a proxy for a diagnosis or problem that is not yet determined.

When the diagnosis is related to an allergy or intolerance, the [Condition](/docs/api/fhir/resources/condition) and [AllergyIntolerance](/docs/api/fhir/resources/allergyintolerance) resources can both be used. However, to be actionable for decision support, using [Condition](/docs/api/fhir/resources/condition) alone is not sufficient as the allergy or intolerance condition needs to be represented as an [AllergyIntolerance](/docs/api/fhir/resources/allergyintolerance).

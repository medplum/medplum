Refer to the US Core [Encounter](http://hl7.org/fhir/us/core/StructureDefinition-us-core-encounter.html) Profile and the US Core [Condition Encounter](http://hl7.org/fhir/us/core/StructureDefinition-us-core-condition-encounter-diagnosis.html) profile.

## Usage

A patient encounter is further characterized by the setting in which it takes place. Amongst them are ambulatory, emergency, home health, inpatient and virtual encounters. An [Encounter](/docs/api/fhir/resources/encounter) encompasses the lifecycle from pre-admission, the actual encounter (for ambulatory encounters), and admission, stay and discharge (for inpatient encounters). During the encounter the patient may move from practitioner to practitioner and location to location.

Because of the broad scope of [Encounter](/docs/api/fhir/resources/encounter), not all elements will be relevant in all settings. For this reason, admission/discharge related information is kept in a separate Hospitalization component within [Encounter](/docs/api/fhir/resources/encounter). The _class_ element is used to distinguish between these settings, which will guide further validation and application of business rules.

There is also substantial variance from organization to organization (and between jurisdictions and countries) on which business events translate to the start of a new [Encounter](/docs/api/fhir/resources/encounter), or what level of aggregation is used for [Encounter](/docs/api/fhir/resources/encounter). For example, each single visit of a practitioner during a hospitalization may lead to a new instance of [Encounter](/docs/api/fhir/resources/encounter), but depending on local practice and the systems involved, it may well be that this is aggregated to a single instance for a whole hospitalization. Even more aggregation may occur where jurisdictions introduce groups of [Encounters](/docs/api/fhir/resources/encounter) for financial or other reasons. [Encounters](/docs/api/fhir/resources/encounter) can be aggregated or grouped under other [Encounters](/docs/api/fhir/resources/encounter) using the _partOf_ element. See [below](https://www.hl7.org/fhir/#examples) for examples.

[Encounter](/docs/api/fhir/resources/encounter) instances may exist before the actual encounter takes place to convey pre-admission information, including using [Encounters](/docs/api/fhir/resources/encounter) elements to reflect the planned start date or planned encounter locations. In this case the _status_ element is set to 'planned'.

The Hospitalization component is intended to store the extended information relating to a hospitalization event. It is always expected to be the same period as the encounter itself. Where the period is different, another encounter instance should be used to capture this information as a partOf this encounter instance.

The [Procedure](/docs/api/fhir/resources/procedure) and encounter have references to each other, and these should be to different procedures; one for the procedure that was performed during the encounter (stored in [Procedure](/docs/api/fhir/resources/procedure).encounter), and another for cases where an encounter is a result of another procedure (stored in [Encounter](/docs/api/fhir/resources/encounter).indication) such as a follow-up encounter to resolve complications from an earlier procedure.

#### Status Management[](https://www.hl7.org/fhir/encounter.html#8.11.1.1 'link to here')

During the life-cycle of an encounter it will pass through many statuses. Typically these are in order or the organization's workflow: planned, in-progress, finished/cancelled.  
This status information is often used for other things, and often an analysis of the status history is required. This could be done by scanning through all the versions of the encounter, checking the period of each, and then doing some form of post processing. To ease the burden of this (or where a system doesn't support resource histories) a status history component is included.

There is no direct indication purely by the status field as to whether an encounter is considered "admitted".  
The context of the encounter and business practices/policies/workflows/types can influence this definition. (e.g., acute care facility, aged care center, outpatient clinic, emergency department, community-based clinic).  
Statuses of "arrived", "triaged" or "in progress" could be considered the start of the admission, and also have the presence of the hospitalization sub-component entered.

The "on leave" status might or might not be a part of the admission, for example if the patient was permitted to go home for a weekend or some other form of external event.  
The location is also likely to be filled in with a location status of "present".  
For other examples such as an outpatient visit (day procedure - colonoscopy), the patient could also be considered to be admitted, hence the encounter doesn't have a fixed definition of admitted. At a minimum, we do believe that a patient IS admitted when the status is in-progress.

## Relationships

The [Encounter](/docs/api/fhir/resources/encounter) resource is not to be used to store appointment information, the [Appointment](/docs/api/fhir/resources/appointment) resource is intended to be used for that. Note that in many systems outpatient encounters (which are in scope for [Encounter](/docs/api/fhir/resources/encounter)) and [Appointment](/docs/api/fhir/resources/appointment) are used concurrently. In FHIR, [Appointment](/docs/api/fhir/resources/appointment) is used for establishing a date for the encounter, while [Encounter](/docs/api/fhir/resources/encounter) is applicable to information about the actual [Encounter](/docs/api/fhir/resources/encounter), i.e., the patient showing up.  
As such, an encounter in the "planned" status is not identical to the appointment that scheduled it, but it is the encounter prior to its actual occurrence, with the expectation that encounter will be updated as it progresses to completion. [Patient](/docs/api/fhir/resources/patient) arrival at a location does not necessarily mean the start of the encounter (e.g. a patient arrives an hour earlier than he is actually seen by a practitioner).

An appointment is normally used for the planning stage of an appointment, searching, locating an available time, then making the appointment. Once this process is completed and the appointment is about to start, then the appointment will be marked as fulfilled, and linked to the newly created encounter.  
This new encounter may start in an "arrived" status when they are admitted at a location of the facility, and then will move to the ward where another part-of encounter may begin.

[Communication](/docs/api/fhir/resources/communication) resources are used for a simultaneous interaction between a practitioner and a patient where there is no direct contact. Examples include a phone message, or transmission of some correspondence documentation.  
There is no duration recorded for a communication resource, but it could contain sent and received times.

Standard [Extension](/docs/api/fhir/datatypes/extension): **Associated [Encounter](/docs/api/fhir/resources/encounter)**  
This extension should be used to reference an encounter where there is no property that already defines this association on the resource.

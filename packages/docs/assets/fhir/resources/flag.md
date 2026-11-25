## Usage

A flag is a warning or notification of some sort presented to the user - who may be a clinician or some other person involve in patient care. It usually represents something of sufficient significance to warrant a special display of some sort - rather than just a note in the resource. A flag has a subject representing the resource that will trigger its display. This subject can be of different types, as described in the examples below:

- A note that a patient has an overdue account, which the provider may wish to discuss with them - in case of hardship for example (subject = [Patient](/docs/api/fhir/resources/patient))
- An outbreak of Ebola in a particular region (subject=Location) so that all patients from that region have a higher risk of having that condition
- A particular provider is unavailable for referrals over a given period (subject = [Practitioner](/docs/api/fhir/resources/practitioner))
- A patient who is enrolled in a clinical trial (subject=Group)
- Special guidance or caveats to be aware of when following a protocol (subject=PlanDefinition)
- Warnings about using a drug in a formulary requires special approval (subject=Medication)
- etc.

A flag is typically presented as a label in a prominent location in the record to notify the clinician of the potential issues, though it may also appear in other contexts; e.g. notes applicable to a radiology technician, or to a clinician performing a home visit. For patients, the information in the flag will often be derived from the record, and therefore, for a thorough and careful clinician, who has the time to review the notes will be redundant. However, given the volume of information frequently found in patients' records and the potentially serious consequences of losing sight of some facts, this redundancy is deemed appropriate. As well, some flags may reflect information not captured by any other resource in the record. (E.g. "Patient has large dog at home")

In line with its purpose, a flag is concise, highlighting a small set of high-priority issues among the much larger set of data in the chart. Readers who want more detail should consult the chart or other source of information. Caution should be exercised in creating [Flag](/docs/api/fhir/resources/flag) instances. If entries are created for information that could be gleaned in a sufficiently timely fashion by reviewing the patient record, the flag list will itself become overwhelming and will cease to serve its intended purpose.

[Flags](/docs/api/fhir/resources/flag) are expected to persist in a record for some period of time and are, at most, targeted to particular types of practitioners or to practitioners in particular system.

Examples of [Patient](/docs/api/fhir/resources/patient) related issues that might appear in flags:

- Risks to the patient (functional risk of falls, spousal restraining order, latex allergy)
- Patient's needs for special accommodations (hard of hearing, need for easy-open caps)
- Risks to providers (dog in house, patient may bite, infection control precautions)
- Administrative concerns (incomplete information, pre-payment required due to credit risk)

Examples of issues that should not appear **only** in flags:

- Potential allergy or drug interaction to planned therapy (use [DetectedIssue](/docs/api/fhir/resources/detectedissue))
- Known adverse reaction to a substance (use [AllergyIntolerance](/docs/api/fhir/resources/allergyintolerance))

Note that we include "latex allergy" in the "in scope" list, and "allergy" in the "not in scope" list. The [Flag](/docs/api/fhir/resources/flag) resource is not designed to replace the normal order checking process, and one should not expect to see all allergies in [Flags](/docs/api/fhir/resources/flag). However, if there is an activity that might occur prior to careful evaluation of the record (e.g. donning of latex gloves) and that activity might pose a risk to the patient, that is the sort of eventuality the [Flag](/docs/api/fhir/resources/flag) is intended to support.

Specific guidelines about what type of information is appropriate to expose using [Flag](/docs/api/fhir/resources/flag), as well as what categories of individuals should see particular flags, will vary by interoperability community.

## Relationships

[Flags](/docs/api/fhir/resources/flag) may highlight a highly condensed view of information found in the [AllergyIntolerance](/docs/api/fhir/resources/allergyintolerance), [Condition](/docs/api/fhir/resources/condition), [Observation](/docs/api/fhir/resources/observation), [Procedure](/docs/api/fhir/resources/procedure) and possibly other resources. A [common extension](https://www.hl7.org/fhir/extension-flag-detail.html) allows the linkage of a [Flag](/docs/api/fhir/resources/flag) to the supporting detail resource. The purpose of these other resources is to provide detailed clinical information. The purpose of a [Flag](/docs/api/fhir/resources/flag) is to alert practitioners to information that is important to influence their interaction with a [Patient](/docs/api/fhir/resources/patient) prior to detailed review of the record.

[Flags](/docs/api/fhir/resources/flag) are not used to convey information to a specific individual or organization (e.g. an abnormal lab result reported to the ordering clinician, reporting of an adverse reaction to a regulatory authority). These are handled using the [CommunicationRequest](/docs/api/fhir/resources/communicationrequest) and the [Communication](/docs/api/fhir/resources/communication) resources.

[Flags](/docs/api/fhir/resources/flag) are not raised as a result of a reported or proposed action (e.g. drug-drug interactions, duplicate therapy warnings). These would be handled using [DetectedIssue](/docs/api/fhir/resources/detectedissue).

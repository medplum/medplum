## Usage

Communication is one of the [event](https://www.hl7.org/fhir/workflow.html#event) resources in the FHIR [workflow](https://www.hl7.org/fhir/workflow.html) specification.

This resource is a record of a communication even if it is planned or has failed. A communication is a conveyance of information from one entity, a sender, to another entity, a receiver. The sender and receivers may be patients, practitioners, related persons, organizations, or devices. [Communication](/docs/api/fhir/resources/communication) use cases include:

- A reminder or alert delivered to a responsible provider
- A recorded notification from the nurse to the on-call physician (or any other specified person) that a patient's temperature exceeds a value
- A notification to a public health agency of a patient presenting with a communicable disease reportable to the public health agency
- Patient educational material sent by a provider to a patient
- Unable to deliver lab results to ordering physician

Non-patient specific communication use cases may include:

- A nurse call from a hall bathroom
- Advisory for battery service from a pump

## Relationships

This resource is a record of a communication that has occurred. It does not represent the actual flow of communication. While [AuditEvent](/docs/api/fhir/resources/auditevent) can track electronic disclosures of information, it cannot track conversations, phone calls, letters and other interactions that are not system-to-system. And even for system-to-system communications, the specific end recipients might not be known. Furthermore, [AuditEvents](/docs/api/fhir/resources/auditevent) are not considered to be "part" of the patient record, while **Communication** instances are. The **Communication** resource is not used as a general audit mechanism to track every disclosure of every record. Rather, it is used when a clinician or other user wants to ensure a record of a particular communication is itself maintained as part of the reviewable health record.

[Flag](/docs/api/fhir/resources/flag) resources represent a continuous ongoing "communication" alerting anyone dealing with the patient of certain precautions to take or issues to be aware of. The flags are continuously present as an ongoing reminder. This is distinct from **Communication** where there is a specific intended sender and receiver and the information is delivered only once.

**Communication and [Encounter](/docs/api/fhir/resources/encounter)**

The [Communication](/docs/api/fhir/resources/communication) is about the transfer of information (which might or might not occur as part of an encounter), while [Encounter](/docs/api/fhir/resources/encounter) is about the coming together (in person or virtually) of a [Patient](/docs/api/fhir/resources/patient) with a [Practitioner](/docs/api/fhir/resources/practitioner). [Communication](/docs/api/fhir/resources/communication) does not deal with the duration of a call, it represents the fact that information was transferred at a particular point in time.

The phone calls involving the [Patient](/docs/api/fhir/resources/patient) should be handled using [Encounter](/docs/api/fhir/resources/encounter). Phone calls not involving the patient (e.g. between practitioners or practitioner to relative) that are tracked for billing or other purposes can use [Communication](/docs/api/fhir/resources/communication) to represent the information transferred but are not ideal to represent the call itself. A better mechanism for handling such calls will be explored in a future release.

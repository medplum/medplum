## Usage

The [EpisodeOfCare](/docs/api/fhir/resources/episodeofcare) Resource contains information about an association of a [Patient](/docs/api/fhir/resources/patient) with a Healthcare Provider for a period of time under which related healthcare activities may occur.

In many cases, this represents a period of time where the Healthcare Provider has some level of responsibility for the care of the patient regarding a specific condition or problem, even if not currently participating in an encounter.

These resources are typically known in existing systems as:

- EpisodeOfCare: Case, Program, Problem, Episode
- Encounter: Visit, Contact

#### Multiple [Organizations](/docs/api/fhir/resources/organization) and Transfer of Care[](https://www.hl7.org/fhir/episodeofcare.html#8.10.1.1 'link to here')

Many organizations can be involved in an [EpisodeOfCare](/docs/api/fhir/resources/episodeofcare); however each organization will have its own [EpisodeOfCare](/docs/api/fhir/resources/episodeofcare) resource instance that tracks its responsibility with the patient.

When an [Organization](/docs/api/fhir/resources/organization) completes their involvement with the patient and transfers care to another [Organization](/docs/api/fhir/resources/organization). This is often in the form of a referral to another [Organization](/docs/api/fhir/resources/organization) (or [Organizations](/docs/api/fhir/resources/organization)).

When an incoming referral is received a new [EpisodeOfCare](/docs/api/fhir/resources/episodeofcare) may be created for this organization. The initial step(s) in the intake workflow for the referral often involve some form of assessment(s), eligibility, capacity, care levels, which could take some time.  
Once the intake process is completed and the patient is accepted, a [CarePlan](/docs/api/fhir/resources/careplan) is often created.

## Relationships

The primary difference between the [EpisodeOfCare](/docs/api/fhir/resources/episodeofcare) and the [Encounter](/docs/api/fhir/resources/encounter) is that the [Encounter](/docs/api/fhir/resources/encounter) records the details of an activity directly relating to the patient, while the [EpisodeOfCare](/docs/api/fhir/resources/episodeofcare) is the container that can link a series of [Encounters](/docs/api/fhir/resources/encounter) together for problems/issues.  
The Example scenarios below give some good examples as to when you might want to be using an [EpisodeOfCare](/docs/api/fhir/resources/episodeofcare).

This difference is a similar difference between the [EpisodeOfCare](/docs/api/fhir/resources/episodeofcare) and a [CarePlan](/docs/api/fhir/resources/careplan). The [EpisodeOfCare](/docs/api/fhir/resources/episodeofcare) is a tracking resource, rather than a planning resource.  
The [EpisodeOfCare](/docs/api/fhir/resources/episodeofcare) usually exists before the [CarePlan](/docs/api/fhir/resources/careplan). You don't need a [CarePlan](/docs/api/fhir/resources/careplan) to use an [EpisodeOfCare](/docs/api/fhir/resources/episodeofcare).

## Background and Context

Systems collect a coherent group of activities (such as encounters) related to a patient's health condition or problem often referred to as a Care Episode. Information about an episode is often shared across systems, and in some cases organizational and disciplinary boundaries. An [EpisodeOfCare](/docs/api/fhir/resources/episodeofcare) contains details about the purpose of the care and can exist without any activities.  
The minimal information that would be required in an episode of care would be a patient, organization and a reason for the ongoing association. Other reasons for creating an [EpisodeOfCare](/docs/api/fhir/resources/episodeofcare) could be for tracking the details required for government reporting or billing.

#### Expected Implementations[](https://www.hl7.org/fhir/episodeofcare.html#8.10.3.1 'link to here')

- Chronic Disease Management Systems
- Community Care Systems
  - Tracking progress of a specific condition
  - Tracking government funding
- Problem based General Practice systems
- Disability Support Systems
- Aged Care Systems (Community and Residential)

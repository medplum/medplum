## Usage

The [HealthcareService](/docs/api/fhir/resources/healthcareservice) resource is used to describe a single healthcare service or category of services that are provided by an organization at a location.  
The location of the services could be virtual, as with telemedicine services.

Common examples of [HealthcareServices](/docs/api/fhir/resources/healthcareservice) resources are:

- Allied Health
- Clinical Neuropsychologist
- Podiatry Service
- Smallville Hospital Emergency Services
- Respite care provided at a nursing home or hostel
- 24hr crisis telephone counseling service
- Information, advice and/or referral services; Disability, Telecommunications
- Rural TeleHealth Services
- Hospital in the home
- Yellow Cabs
- Pharmacy
- Active Rehab
- Social Support
- Drug and/or alcohol counseling
- Day Programs, Adult Training & Support Services
- Consulting psychologists and/or psychology services
- Group Hydrotherapy
- Little River Home Maintenance

_HealthcareService resources do not represent Computer related Services (not SOA)_

Example uses of [HealthcareService](/docs/api/fhir/resources/healthcareservice) resources are:

- National Services Directory - Consumer Focus
- National Services Directory - [Practitioner](/docs/api/fhir/resources/practitioner) Referrals Searching
- Organization's Client Portal - to locate services / book appointments
- [Address](/docs/api/fhir/datatypes/address) book of services for Referrals  
  _including references to [Questionnaires](/docs/api/fhir/resources/questionnaire) for assessments that are required as part of the referral_
- Health Network internal directory _Used for tracking available services offered internally, and also those offered by business partners.  
  This information may also include costing information._

## Relationships

The [HealthcareService](/docs/api/fhir/resources/healthcareservice) resource can be used with the [Schedule](/docs/api/fhir/resources/schedule) resource to define actual availability of the service. This would be done by using the [Schedule](/docs/api/fhir/resources/schedule)'s Actor property.

When creating an [Appointment](/docs/api/fhir/resources/appointment), the [HealthcareService](/docs/api/fhir/resources/healthcareservice) is to be assigned to one of the participants.  
It is up to the scheduling system to determine if the service is available and can be accepted.

The [HealthcareService](/docs/api/fhir/resources/healthcareservice) resource is used with the following resources:

- **[Organization](/docs/api/fhir/resources/organization)**: The organization provides the services, the healthcareservice describes the services
- **[ServiceRequest](/docs/api/fhir/resources/servicerequest)**: This is a subject specific request for a specific service, it may be to a specific healthcare service, and/or simply a coded service value. The granularity included in the request codes may be finer than defined in the healthcare service.
- **[OrganizationAffiliation](/docs/api/fhir/resources/organizationaffiliation)**: Might constrain a list of healthcare services that are available between 2 organizations
- **[Location](/docs/api/fhir/resources/location)**: Specifies the place where the service(s) are offered/available within.

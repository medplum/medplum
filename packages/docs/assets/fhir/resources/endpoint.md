## Usage

An endpoint describes the technical details of a location that can be connected to for the delivery/retrieval of information. Sufficient information is required to ensure that a connection can be made securely, and appropriate data transmitted as defined by the endpoint owner. This is not a description of details of the current system, as found in [CapabilityStatement](/docs/api/fhir/resources/capabilitystatement), but of another (potentially external) system.  
These may be locally hosted services, regional services, or national service.

These resources are typically used to identify where to locate endpoint details for:

- Questionnaires: Where to send information (currently an SDC extension with just the address)
- ValueSet: Where related Terminology Services can be found (where not local)
- Subscription: The destination to send the subscribed data (or to pull)
- Messaging: (currently defined in the Message Header, but only as the address)
- Referrals: Where to send referral requests  
  (linked to the services directory resources - [Organization](/docs/api/fhir/resources/organization)/Location/Practitioner/HealthcareService)
- Referrals - Templates: Where to locate referral templates (Questionnaires)  
  (linked to the services directory resources - [Organization](/docs/api/fhir/resources/organization)/Location/Practitioner/HealthcareService)
- CarePlans: Where a shared [CarePlan](/docs/api/fhir/resources/careplan) can be found
- Scheduling: Where to lookup to discover schedules/availability information  
  (linked to the services directory resources - [Organization](/docs/api/fhir/resources/organization)/Location/Practitioner/HealthcareService)
- Scheduling: Where to lookup to send appointment requests  
  (linked to the services directory resources - [Organization](/docs/api/fhir/resources/organization)/Location/Practitioner/HealthcareService)
- Patient/Person: [Location](/docs/api/fhir/resources/location) of Master [Patient](/docs/api/fhir/resources/patient)/Person Indexes
- Service Provider Directories: [Location](/docs/api/fhir/resources/location) of related directories (parent/child/federated)
- DICOM/imaging: [Location](/docs/api/fhir/resources/location) of where to query for imaging content and metadata (QIDO-RS, WADO-RS, or WADO-URI)

## Relationships

#### [CapabilityStatement](/docs/api/fhir/resources/capabilitystatement)[](/docs/api/fhir/resources/endpoint 'link to here')

The endpoint is distinct from a capability statement in that the [CapabilityStatement](/docs/api/fhir/resources/capabilitystatement) statement describes the entire capability of a server (and in the metadata case, just this server)  
Where the endpoint resource describes the technical details for how to connect, and for what purposes (which could be a small sub-set of the server's capabilities, and might not be a FHIR endpoint).

#### [ContactPoint](/docs/api/fhir/datatypes/contactpoint)[](https://www.hl7.org/fhir/endpoint.html#8.9.2.2 'link to here')

[Endpoints](/docs/api/fhir/resources/endpoint) are used to facilitate system to system communication, providing the details of the addressing of the system, purpose of use, protocols required/provided, and any other details required to communicate between the systems. (such as configuration parameters, require headers ...) The address value in the endpoint can only be used in the context of the provided details.

E.g. If the endpoint has a URL for an XDS service, using that in a browser by a user is meaningless.

E.g.2 If the endpoint has a US Direct address, using this to send a normal email message will not work, as they are not true email addresses (even though they appear to be)

A [ContactPoint](/docs/api/fhir/datatypes/contactpoint) contains contact information, such as a phone number, web address that a user can directly interact with, no additional information would be required to use the value. The value is generally used to communicate with an entity directly, not a system.

## Background and Context

#### Expected Implementations[](https://www.hl7.org/fhir/endpoint.html#8.9.3.1 'link to here')

- Any solution where there are distributed FHIR servers deployed and need discovery/configuration
- (Refer to the scope and usage section for common uses)

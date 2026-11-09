## Usage

CommunicationRequest is one of the [request](https://www.hl7.org/fhir/workflow.html#request) resources in the FHIR [workflow](https://www.hl7.org/fhir/workflow.html) specification.

This resource is a record of a request for a communication to be performed. A communication is a conveyance of information from one entity, a sender, to another entity, a receiver. The requester requests the sender to send the payload to the recipient. The sender and receivers may be patients, practitioners, related persons, organizations, and devices. Uses of communication request include:

- A computer-based decision-support system requesting a reminder or alert be delivered to a responsible provider
- A physician requesting notification from the nurse if a patient's temperature exceeds a value
- A monitoring system or a provider requesting a staff member or department to notify a public health agency of a patient presenting with a communicable disease reportable to the public health agency
- A computer-based decision-support system proposes to send educational material to a patient

## Relationships

This resource is a record of a request. It does not represent the actual flow of communication.

The use of **CommunicationRequest** excludes requests for referrals and requests for therapy or counseling which would be handled by the [ServiceRequest](/docs/api/fhir/resources/servicerequest) resource. The performance of a **CommunicationRequest** may result in a [Communication](/docs/api/fhir/resources/communication) resource.

## Usage

The audit event is based on the IHE-ATNA Audit record definitions, originally from [RFC 3881](http://tools.ietf.org/html/rfc3881) , and now managed by DICOM (see [DICOM Part 15 Annex A5](http://medical.nema.org/medical/dicom/current/output/html/part15.html#sect_A.5) ).

- ASTM E2147 – Setup the concept of security audit logs for healthcare including accounting of disclosures
- IETF RFC 3881 – Defined the Information Model (IETF rule forced this to be informative)
- DICOM Audit Log Message – Made the information model Normative, defined Vocabulary, Transport Binding, and Schema
- IHE ATNA – Defines the grouping with secure transport and access controls; and defined specific audit log records for specific IHE transactions.
- NIST SP800-92 – Shows how to do audit log management and reporting – consistent with our model
- HL7 PASS – Defined an Audit Service with responsibilities and a query interface for reporting use
- ISO 27789 – Defined the subset of audit events that an EHR would need
- ISO/HL7 10781 EHR System Functional Model Release 2
- ISO 21089 Trusted End-to-End Information Flows

This resource is managed collaboratively between HL7, DICOM, and IHE.

The primary purpose of this resource is the maintenance of security audit log information. However, it can also be used for any audit logging needs and simple event-based notification.

## Background and Context

All actors - such as applications, processes, and services - involved in an auditable event should record an [AuditEvent](/docs/api/fhir/resources/auditevent). This will likely result in multiple [AuditEvent](/docs/api/fhir/resources/auditevent) entries that show whether privacy and security safeguards, such as access control, are properly functioning across an enterprise's system-of-systems. Thus, it is typical to get an auditable event recorded by both the application in a workflow process and the servers that support them. For this reason, duplicate entries are expected, which is helpful because it may aid in the detection of. For example, fewer than expected actors being recorded in a multi-actor process or attributes related to those records being in conflict, which is an indication of a security problem. There may be non-participating actors, such as trusted intermediary, that also detect a security relevant event and thus would record an [AuditEvent](/docs/api/fhir/resources/auditevent), such as a trusted intermediary.

Security relevant events are not limited to communications or RESTful events. They include:

- software start-up and shutdown;
- user login and logout;
- access control decisions;
- configuration events;
- software installation;
- policy rules changes; and
- manipulation of data that exposes the data to users.

See the [Audit Event Sub-Type](https://www.hl7.org/fhir/valueset-audit-event-sub-type.html) vocabulary for guidance on some security relevant events.

The content of an [AuditEvent](/docs/api/fhir/resources/auditevent) is intended for use by security system administrators, security and privacy information managers, and records management personnel. This content is not intended to be accessible or used directly by other healthcare users, such as providers or patients, although reports generated from the raw data would be useful. An example is a patient-centric accounting of disclosures or an access report. Servers that provide support for [AuditEvent](/docs/api/fhir/resources/auditevent) resources would not generally accept update or delete operations on the resources, as this would compromise the integrity of the audit record. Access to the [AuditEvent](/docs/api/fhir/resources/auditevent) would typically be limited to security, privacy, or other system administration purposes.

Relationship of [AuditEvent](/docs/api/fhir/resources/auditevent) and [Provenance](/docs/api/fhir/resources/provenance) resources are often (though not exclusively) created by the application responding to the create/read/query/update/delete/execute etc. event. A [Provenance](/docs/api/fhir/resources/provenance) resource contains overlapping information, but is a record-keeping assertion that gathers information about the context in which the information in a resource "came to be" in its current state, e.g., whether it was created de novo or obtained from another entity in whole, part, or by transformation. [Provenance](/docs/api/fhir/resources/provenance) resources are prepared by the application that initiates the create/update of the resource and may be persisted with the [AuditEvent](/docs/api/fhir/resources/auditevent) target resource.

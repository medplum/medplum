---
tags: [compliance]
---

# Good Manufacturing Practices

Good Manufacturing Practices (GMP) are a set of guidelines, regulations, and quality management systems designed to ensure that products, particularly pharmaceuticals, medical devices, and food products, are consistently manufactured, controlled, and tested according to established quality standards.

The primary goal of GMP is to protect the consumer by minimizing risks associated with the manufacturing process, ensuring the safety, quality, and efficacy of products.

Medplum customers who work with medical devices, shipping medications, durable medical equipment or in vitro diagnostics (IVD) should use the features outlined in this guide to be compliant.

Medplum is used side-by-side with a Quality Management System (QMS),Learning Management System (LMS) and Enterprise Resource Planning (ERP) System to fulfill the GMP requirements.

## GMP Controls

GMP requires that implementors maintain the audit ready records in the following categories. We recommend reviewing the items on this checklist to inform your implementation.

Facility and Equipment

- Control requires proper design, maintenance, and cleanliness of facilities and equipment to prevent contamination and facilitate quality control.
- Recommended implementation is to represent relevant facilities as [Location](/docs/api/fhir/resources/location) resources and relevant suppliers as [Organization](/docs/api/fhir/resources/organization) resources
- Relevant queries [Locations](https://app.medplum.com/Location), [Organizations](https://app.medplum.com/Organization).

Personnel

- Adequate training, qualifications, and hygiene of personnel involved in the manufacturing process to maintain high-quality standards.
- Recommended implementation is to ensure that identifiers from your HRIS and LMS are added to the [Practitioner](/docs/api/fhir/resources/practitioner) resource. Where appropriate, note their PractitionerQualification.
- Relevant Queries [Practitioner](https://app.medplum.com/Practitioner), [ProjectMembership](https://app.medplum.com/ProjectMembership).

Documentation

- Comprehensive documentation of production processes, standard operating procedures (SOPs), and quality control measures to ensure traceability and accountability.
- Medplum is typically not the source of truth for SOPs, but key workflow elements such as Questionnaires, and PlanDefinitions should be tagged with the appropriate identifiers and can be integrated with the QMS.
- Relevant queries [Questionnaire](https://app.medplum.com/Questionnaire), [PlanDefinition](https://app.medplum.com/PlanDefinition)

Material Management

- Control of raw materials, including testing, storage, and handling, to prevent contamination and ensure product quality.
- Medplum has built in resources to track materials and supplies and is well suited to be integrated with an ERP.
- Relevant queries [SupplyRequest](https://app.medplum.com/SupplyRequest), [SupplyDelivery](https://app.medplum.com/SupplyDelivery), [Device](https://app.medplum.com/Device),[DeviceRequest](https://app.medplum.com/DeviceRequest), [ServiceRequest](https://app.medplum.com/ServiceRequest) and many resources related to medication orders and administration.

Production and Process Controls

- Ensuring consistency and control of production processes, including validation, monitoring, and deviation management.
- Medplum Subscriptions and Bots are the primary mechanism of validating and alerting.
- Relevant queries [Bots](https://app.medplum.com/Bot), [Subscriptions](https://app.medplum.com/Subscription).

Quality Control and Assurance

- Testing and monitoring of products to verify that they meet established specifications and regulatory requirements.
- Medplum resources are used to store and track quality related data, for example temperature logs for freezers, specimen photos or instrument logs.
- Queries are case dependent.

Complaint Handling and Recall Procedures

- Efficient systems for addressing customer complaints and initiating product recalls if necessary.
- Medplum Questionnaires are often used to capture customer complaints, and QuestionnaireResponses are generated.
- Relevant queries [Questionnaire](https://app.medplum.com/Questionnaire), [QuestionnaireResponse](https://app.medplum.com/QuestionnaireResponse).

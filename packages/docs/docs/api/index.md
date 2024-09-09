---
sidebar_position: 0
---

# API Overview

Welcome to the Medplum API reference. This section is intended as reference material, overview and how-to guides can be found in the [Documentation](/docs) section. The base URL for hosted Medplum is https://api.medplum.com/fhir/R4.

## System Requirements

The API requires [registration](/docs/tutorials/register) and acceptance of the [terms of service](/terms). The following standards are supported:

- US Core 5.0.1 / USCDI v2
- SMART App Launch 2.0.0
- Bulk Data 2.0.0

Apps using the API must be able to:

- Support OAuth 2.0 or SMART-on-FHIR authentication framework
- Connect via HTTPS with TLS 1.2 and 1.3
- Store the client_id and client_secret for authentication
- Process JSON response files

## Authentication and Authorization

If you are using Medplum as an identity-provider, [**OAuth**](./api/oauth) documents the endpoints supplied by the Medplum server to complete the [OAuth2 Auth Code Flow](https://auth0.com/docs/get-started/authentication-and-authorization-flow/authorization-code-flow). Medplum supports a wide variety of authentication and authorization options, including SMART-on-FHIR scopes.

### SMART-on-FHIR

Medplum uses the SMART Application Launch Framework Implementation Guide (http://hl7.org/fhir/smart-app-launch/1.0.0/) and provides an OAuth 2.0 compliant authorization server to enable patients and providers secure authentication access to their health data. As described by the specification itself, SMART on FHIR:

“Connects third-party applications to Electronic Health Record data, allowing apps to launch from inside or outside the user interface of an EHR system. The framework supports apps for use by clinicians, patients, and others via PHR or Patient Portal or any FHIR system where a user can give permissions to launch an app. It provides a reliable, secure authorization protocol for a variety of app architectures, including apps that run on an end-user’s device as well as apps that run on a secure server.”

### Patient User Access

Through their selected application, patients will be prompted for their login and credentials which they established in their patient portal accounts. SMART-on-FHIR enables the user to authenticate themselves with Medplum authorization and choose the scope of their patient data which they intend to access and share with
their application. This decision provides an access token to their application of choice, and applications which are compliant with SMART on FHIR can then use this access token to access their health data stored on Medplum. These applications will continue to have access to the patient data until the patient revokes their access permission.

Related material:

- [Patient](/docs/api/fhir/resources/patient) FHIR resource
- [User](/docs/api/fhir/medplum/user)
- [Project Membership](/docs/api/fhir/medplum/projectmembership)
- [Access Control](/docs/access/access-policies) documentation

### Clinician User Access

Clinician users of Medplum can also use approved SMART-on-FHIR applications to access patient data in the system. Clinicians need to be explicitly granted Practitioner accounts with the appropriate [access controls](/docs/access/access-policies) in order to consume patient data. They will need to be [invited](/docs/app/invite) by administrator.

## FHIR Resources

For documentation on all the FHIR Resources that Medplum supports, check out our [**FHIR API docs**](./api/fhir). If you're asking yourself, "_What's FHIR?_", check out our [FHIR Basics page](/docs/fhir-basics.md). The full list of [FHIR resources](/docs/api/fhir/resources) page describes the resources and [data types](/docs/api/fhir/datatypes) in detail. This API reference is an Open Source implementation of the [ONC Certification (g)(10) Criteria](/docs/compliance/onc)

We also make available our [Open API Spec](https://api.medplum.com/openapi.json).

## Error Handling

The following resources can be used to understand error messages and error handling workflows. Per the FHIR spec errors are [OperationOutcome](/docs/api/fhir/resources/operationoutcome) resources with [type](https://hl7.org/fhir/valueset-issue-type.html) and [severity](https://hl7.org/fhir/valueset-issue-severity.html) properties.

In case of server errors you can expect [HTTP Status codes](https://en.wikipedia.org/wiki/List_of_HTTP_status_codes).

## SDK

Our [**TypeScript SDK**](./sdk/core.medplumclient) provides a powerful, type-safe library to create and store healthcare data in Medplum. The SDK can be used in standalone applications and is used by [bots](/docs/bots).

## Prebuilt UI

If you're building a [**React**](https://reactjs.org/) app with Medplum, our [**React Components**](./api/react) can give you building blocks to get you started.

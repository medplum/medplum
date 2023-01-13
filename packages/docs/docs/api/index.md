---
sidebar_position: 0
---

# API Overview

Welcome to the Medplum API reference. This section is intended as reference material, overview and how-to guides can be found in the [Documentation](/docs) section.

**Minimum Requirements**: The API does not require any specific software packages to access, but requires [registration](/docs/tutorials/register). The following standards are supported:

- US Core 5.0.1 / USCDI v2
- SMART App Launch 2.0.0
- Bulk Data 2.0.0

**FHIR Data Model**: For documentation on all the FHIR Resources that Medplum supports, check out our [**FHIR API docs**](./api/fhir). If you're asking yourself, "_What's FHIR?_", check out our [FHIR Basics page](/docs/fhir-basics.md). The full list of [FHIR resources](/docs/api/fhir/resources) page describes the resources and [data types](/docs/api/fhir/datatypes) in detail. This API reference is an Open Source implementation of the [ONC Certification (g)(10) Criteria](/docs/compliance/onc#standardized-api-for-patient-and-population-services-cures-update-g10)

**Authentication and Authorization:** If you are using Medplum as an identity-provider, [**OAuth**](./api/oauth) documents the endpoints supplied by the Medplum server to complete the [OAuth2 Auth Code Flow](https://auth0.com/docs/get-started/authentication-and-authorization-flow/authorization-code-flow). Medplum supports a wide variety of authentication and authorization options, including SMART-on-FHIR scopes.

**Typescript:** Our [**TypeScript SDK**](./sdk/classes/MedplumClient) provides a powerful, type-safe library to create and store healthcare data in the Medplum CDR.

**UI Components:** If you're building a [**React**](https://reactjs.org/) app with Medplum, our [**React Components**](./api/react-components) can give you building blocks to get you started.

**Error Handling:** The following resources can be used to understand error messages and error handling workflows. Per the FHIR spec errors are [OperationOutcome](/docs/api/fhir/resources/operationoutcome) resources with [type](https://hl7.org/fhir/valueset-issue-type.html) and [severity](https://hl7.org/fhir/valueset-issue-severity.html) properties.

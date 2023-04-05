---
sidebar_position: 8
tags: [auth]
---

# SMART Scopes

SMART on FHIR’s authorization scheme uses [OAuth2 scopes](https://oauth.net/2/scope/) to communicate (and negotiate) access requirements.

For those using scopes, we recommend reading [background information on HL7.org](http://hl7.org/fhir/smart-app-launch/scopes-and-launch-context.html). For background this documentation on [OAuth scopes](https://auth0.com/docs/get-started/apis/scopes) is also useful.

Medplum supports the `SMART App Launch 2.0.0` [standard](https://hl7.org/fhir/smart-app-launch/).

## When and Why SMART Scopes are Useful

SMART Scopes are best understood as part of a FHIR-enabled app ecosystem. Imagine a patient portal containing FHIR data, with a patient logged in. Within that portal is a link to another application, and when that link is clicked the second application is launched - prompting the user to authorize and grant access to the data in the patient portal.

This handshake is common in and supported by EHRs, PHRs and other systems that store and use FHIR data. SMART Scopes provide a secure authorization protocol for a variety of app architectures, including apps that run on an end-user’s device (e.g. mobile devices) as well as apps that run on a secure server. The framework `SMART App Launch` supports four key use cases:

- Patients apps that launch standalone
- Patient apps that launch from a portal like a personal health record
- Provider apps that launch standalone
- Provider apps that launch from a portal like a traditional electronic health record

## Supported Scopes

Medplum supports the following scopes.

- `patient/*.rs`
- `user/*.cruds`
- `openid`
- `fhirUser`
- `launch`
- `launch/patient`
- `offline_access`
- `online_access`

## Understanding Scopes

Scopes grant read, write, search and update access to specific resources, here are some examples of scopes and what they grant access to.

- `scope=patient/Observation.r`: the user is allowed to read Observation resources for a specific patient
- `scope=user/Encounter.cu`: the user is allowed to write (create and update) Encounter resources
- `scope=user/*.rs`: the user is allowed to read and search any type of resource
- `scope=user/*.cu`: the user is allowed to write (create and update) any type of resource
- `scope=[array of individual scopes]`
- `patient=123`: the user is allowed access to resources in the Patient/123 [compartment](http://hl7.org/fhir/R4B/compartmentdefinition.html).

## Authorization UI

During authorization, the user has an option to select/deselect scopes and will see a scope selection page like the below.

![Smart scopes example](/img/auth/smart-scopes.png)

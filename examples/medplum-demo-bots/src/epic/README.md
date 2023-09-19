# Epic Connection Demo

The `epic-query-patient.ts` bot is a simple introductory bot that demonstrates how authenticate and connect to an [Epic FHIR](https://fhir.epic.com/) server and read a single resource by id. You can [sign up online](https://fhir.epic.com/Developer/Apps) for credentials to the EPIC developer environment.

## Application Audience

Epic supports patient facing applications, clinician facing applications and backend system applications. This bot is an **example of a backend system application** which is where the Medplum bot connects directly to the FHIR server with no user facing authentication flow. To get your application to behave as intended it will require the right level of access to the Epic FHIR server. We recommend reading the [Epic FHIR documentation](https://fhir.epic.com/Documentation?docId=developerguidelines) to understand which FHIR APIs will be needed to function correctly. The Epic FHIR API has many configuration parameter and correct configuration will be required for a successful implementation.

## Requirements

The code in the sample `epic-query-patient.ts` requires `privateKey`, `clientId`, `baseUrl`, `tokenUrl`, and `fhirUrlPath` to successfully connect. The example demonstrates connection to the developer environment, but the exact production environment will depend on the institution you are connecting to. A list of [EPIC FHIR endpoints](https://open.epic.com/MyApps/Endpoints) is available online.

Medplum examples use FHIR R4, so take care not to select STU3 or DSTU in your configuration settings.

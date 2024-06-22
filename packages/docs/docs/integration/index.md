# Integration

Medplum's integrations the most commonly used features of the platform, and the tools can be used to build effective robust integrations. Medplum supports three types of integrations:

- **First party** integrations with common medical systems
- **Common medical integrations** like FHIR, HL7 V2, SMART-on-FHIR and SFTP
- **Custom built** integrations using the SDK and Bot templates

## First Party Integrations

Medplum supports the following first party integrations.

| Name                                                                   | Type            | Description                                   | Documentation                                                                                               |
| ---------------------------------------------------------------------- | --------------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| [Okta](https://www.okta.com/)                                          | Authentication  | Enable Okta SSO for Providers                 | [Okta setup](/docs/auth/methods/domain-level-identity-providers#okta-setup)                                 |
| [Auth0](https://auth0.com/)                                            | Authentication  | Enable Auth0 SSO for Providers and Patients   | [Auth0 account Setup](/docs/auth/methods/external-ids#invite-user)                                          |
| [Google Authentication](https://safety.google/authentication/)         | Authentication  | Enable Google SSO for Providers and Patients  | [Google Auth Setup](/docs/auth/methods/google-auth)                                                         |
| [Azure SSO](https://learn.microsoft.com/en-us/entra/identity-platform) | Authentication  | Enable Azure SSO for Providers and Patients   | [Azure Auth Setup](https://www.medplum.com/docs/auth/methods/external-identity-providers)                   |
| [Labcorp](https://www.labcorp.com/)                                    | Diagnostics     | Lab orders and results                        | [Bot and setup](https://github.com/medplum/medplum/tree/main/examples/medplum-demo-bots/src/health-gorilla) |
| [Quest](https://www.questdiagnostics.com/)                             | Diagnostics     | Lab orders and results                        | [Bot and setup](https://github.com/medplum/medplum/tree/main/examples/medplum-demo-bots/src/health-gorilla) |
| [Health Gorilla](https://www.healthgorilla.com/)                       | HIE/Diagnostics | Diagnostics orders - records - ADT            | [Bot and setup](https://github.com/medplum/medplum/tree/main/examples/medplum-demo-bots/src/health-gorilla) |
| [Candid Health](https://www.joincandidhealth.com/)                     | Billing         | Revenue cycle and insurance eligibility check | [Candid bot](https://github.com/medplum/medplum/tree/main/examples/medplum-demo-bots/src/candid-health)     |
| [Particle](https://www.particlehealth.com/)                            | HIE             | Read/Write from Exchanges                     | Coming soon                                                                                                 |
| [Epic Systems](https://www.epic.com/)                                  | EHR             | Read/Write via FHIR API                       | [Epic JWT authentication](https://github.com/medplum/medplum/tree/main/examples/medplum-demo-bots/src/epic) |
| [Recaptcha](https://www.google.com/recaptcha/about/)                   | Security        | Enable recaptcha on patient registration      | [Setup recaptcha](/docs/auth/custom-emails#setup-recaptcha)                                                 |
| [Datadog](https://www.datadoghq.com/)                                  | Observability   | Application monitoring                        | [Datadog sidecar setup](/docs/self-hosting/datadog)                                                         |
| [Sumo Logic](https://www.sumologic.com/)                               | Observability   | Application monitoring                        | Coming soon                                                                                                 |
| [Snowflake](https://www.datadoghq.com/)                                | Data warehouse  | Synchronize data to datawarehouse             | Documentation coming soon                                                                                   |
| [OpenAI](https://www.openai.com/)                                      | AI              | Large language models                         | Documentation coming soon                                                                                   |

## Common Medical Integrations

Medplum provides templates and playbooks for common medical integrations.

| Name          | Type         | Description                                           | Documentation                                                                                                                                                          |
| ------------- | ------------ | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HL7 V2        | EHR          | Connect to ADT ORU or other HL7 Feeds                 | [On premise agent](/docs/agent)                                                                                                                                        |
| FHIR (g)(10)  | EHR          | FHIR API for other EHRs                               | [Example bot FHIR API connectivity](https://github.com/medplum/medplum/tree/main/examples/medplum-demo-bots/src/epic) [CLI connector](/docs/cli/external-fhir-servers) |
| SFTP          | EHR          | Synchronize data                                      | [Example bot](/docs/bots/file-uploads#sftp-uploads)                                                                                                                    |
| FHIR CMS 9115 | Payor        | FHIR Provider directory for Payor compliance          | [Documentation](/docs/administration/provider-directory)                                                                                                               |
| FHIRcast      | Radiology    | Event driven workflow for workstations                | [Documentation](/docs/fhircast)                                                                                                                                        |
| Video         | Binary Files | Upload and transcode video                            | [Documentation](/docs/fhir-datastore/binary-data)                                                                                                                      |
| PDF           | Binary Files | Upload and access PDF                                 | [Documentation](/docs/fhir-datastore/binary-data)                                                                                                                      |
| Images        | Binary Files | Upload and access image files                         | [Documentation](/docs/fhir-datastore/binary-data)                                                                                                                      |
| OAuth2        | Identity     | Plug in any oAuth2 provider                           | [Documentation](/docs/auth/methods/external-identity-providers)                                                                                                        |
| Basic Auth    | Identity     | Support connections via Basic Auth for legacy systems | [Basic auth](/docs/sdk/core.medplumclient.setbasicauth)                                                                                                                |
| BulkFHIR      | EHR/Payor    | Export FHIR Data for use by partners                  | [BulkFHIR documentation](/docs/api/fhir/operations/bulk-fhir)                                                                                                          |
| SMART-on-FHIR | EHR          | SMART app launch from Medplum or another EHR          | [SMART App Launch](/docs/integration/smart-app-launch)                                                                                                                 |

## Custom built integrations

Medplum provides building blocks for custom integrations. Some examples are below.

| Name                                                                               | Template Type | Description                     | Documentation                                                                                              |
| ---------------------------------------------------------------------------------- | ------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| [Stripe](https://stripe.com/)                                                      | Bot Webhooks  | Synchronize payments data       | [Stripe bot](https://github.com/medplum/medplum/tree/main/examples/medplum-demo-bots/src/stripe-bots)      |
| [CMS 1500](https://www.cms.gov/medicare/cms-forms/cms-forms/downloads/cms1500.pdf) | Bot PDF       | Create PDF for CMS 1500         | [PDF Bot](https://github.com/medplum/medplum/blob/main/examples/medplum-demo-bots/src/create-pdf.ts)       |
| Superbill                                                                          | Bot PDF       | Create PDF for Superbill        | [PDF Bot](https://github.com/medplum/medplum/blob/main/examples/medplum-demo-bots/src/create-pdf.ts)       |
| Medications                                                                        | API           | Prescribe and check medications | [Medication related integration](https://drive.google.com/drive/folders/1tkkKREaeCj8UOZErTHm28_y7jPfYn4Tb) |
| [Acuity Scheduling](https://www.acuityscheduling.com/)                             | Bot Webhooks  | Enable third party scheduling   | [Consuming webhooks](/docs/bots/consuming-webhooks)                                                        |
| [Cal.com](https://cal.com/)                                                        | Bot Webhooks  | Enable third party scheduling   | [Consuming webhooks](/docs/bots/consuming-webhooks)                                                        |

## Integration Building Blocks and Testing

Complex integrations are built by composing [bots](/docs/bots/), [subscriptions](/docs/subscriptions/index.md), [authentication and authorization](/docs/auth/index.md) and the [TypeScript SDK](/docs/sdk/).

- [Running on localhost](/docs/contributing/run-the-stack) is useful for testing integrations
- [CLI](/docs/cli/external-fhir-servers) is commonly used to test connectivity to external FHIR Servers
- [Integration Features and Fixes](https://github.com/medplum/medplum/pulls?q=is%3Apr+label%3Aintegration) on Github show the code that powers many of the integrations.
- [Audit and Logging Features](https://github.com/medplum/medplum/pulls?q=is%3Apr+label%3Aaudit-logging) show several security and observability integrations.
- [Bot Pull Requests](https://github.com/medplum/medplum/issues?q=label%3Abots) can be good reference material for how integrations work.
- [Auth Pull Requests](https://github.com/medplum/medplum/pulls?q=is%3Apr+label%3Aauth) can also be good reference material for integration planning and learning.

## Related

- [Epic Server to Server](https://youtu.be/E8VD9rgadG0) demo on Youtube
- [HL7 Handling using Bots](https://youtu.be/q0SXeb_8H2Q) on Youtube
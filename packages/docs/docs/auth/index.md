---
sidebar_position: 1
---

# Auth and Identity

Medplum supports multiple authentication and authorization configurations, with the intent to **enable required compliance and integration scenarios**. Implementations commonly use multiple authentication and authorization methods.

Authentication (_are you who you say you are?_) and authorization (_what can you do?_) are distinct in Medplum. Several authentication methods (e.g. Google Authentication) are supported. Authorization can be determined by [Access Policies](./access-control.md) or SMART-on-FHIR scopes.

## Patients, Practitioners and Bots

Users are the representation of identities in Medplum, and each user belongs to one or more Medplum Projects. For a specific project, a user can be either a [Practitioner](../api/fhir/resources/practitioner.mdx), [Patient](../api/fhir/resources/patient.mdx) or [Bot](../bots/index.md). At a high level, Practitioners are staff or administrators, Patients are those receiving care and Bots are designed for programmatic access or integrations.

## Resources and Reference

- See [authentication functions](./sdk/classes/MedplumClient#authentication) in the Typescript SDK
- [User profile](./sdk/classes/MedplumClient#user-profile) in the Typescript SDK
- [OAuth endpoints](./api/oauth) reference
- [Medplum resources](./api/fhir/medplum) related to authentication and authorization
- [User registration](https://storybook.medplum.com/?path=/docs/medplum-registerform--basic) react component
- [Sign in form](https://storybook.medplum.com/?path=/docs/medplum-signinform--basic) react component

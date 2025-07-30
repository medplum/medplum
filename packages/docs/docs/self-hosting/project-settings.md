---
sidebar_position: 60
---

# Project Settings

Many settings are also available at the Project level, allowing them to be configured for specific tenants on the server
rather than globally. Only Super Admin users are allowed to edit Project settings.

Additional details are available in the full [`Project` resource schema](/docs/api/fhir/medplum/project).

| Setting                      | Description                                                                                                                                                                                                                                                                                                 | Default |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| `superAdmin`                 | Users belonging to a Project with this flag are granted [Super Admin](/docs/access/projects#superadmin) access to the server. Multiple Projects can have this set.                                                                                                                                          | `false` |
| `checkReferencesOnWrite`     | If `true`, the the server will reject any create or write operations to FHIR resources with a reference to a resource that does not exist.                                                                                                                                                                  | `false` |
| `features`                   | A list of optional features that are enabled for the project. Possible values are listed [below](#project-feature-flags).                                                                                                                                                                                   |         |
| `defaultPatientAccessPolicy` | The default [`AccessPolicy`](/docs/access/access-policies) applied to all [Patient Users](/docs/auth/project-vs-server-scoped-users#project-scoped-users) invited to this [`Project`](/docs/api/fhir/medplum/project). This is required to enable [open patient registration](/docs/auth/open-patient-registration). |         |
| `link`                       | Additional Projects whose [contents should be accessible](/docs/access/projects#project-linking) to users in the current Project.                                                                                                                                                                           |         |
| `defaultProfile`             | [Resource profiles](http://hl7.org/fhir/R4/profiling.html#resources) that will be added to resources written in the Project that do not specify a profile directly. This enables automatic custom resource validation.                                                                                      |         |
| `setting`                    | Arbitrary key-value pairs available to anyone in the Project, can be set by Project Admins.                                                                                                                                                                                                                 |         |
| `secret`                     | Key-value pairs similar to `setting`, that can only be read by Project Admins. These can be used to [pass secrets to Bots](/docs/bots/bot-secrets)                                                                                                                                                          |         |
| `systemSetting`              | Server settings related to the Project: visible to anyone, but can only be set by Super Admins.                                                                                                                                                                                                             |         |
| `systemSecret`               | Key-value pairs that can only be accessed by Super Admins.                                                                                                                                                                                                                                                  |         |

## Project feature flags

Medplum server exposes settings to control access to specific features on a per-Project basis. The available features
are:

| Feature                   | Description                                                                                                                      |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `bots`                    | Project is allowed to create and run [Bots](/docs/bots/bot-basics)                                                               |
| `cron`                    | Can run Bots periodically on [CRON timers](https://www.medplum.com/docs/bots/bot-cron-job)                                       |
| `email`                   | Bots in this project can [send emails](/docs/sdk/core.medplumclient.sendemail)                                                   |
| `google-auth-required`    | [Google authentication](/docs/auth/methods/google-auth) is the only method allowed                                               |
| `graphql-introspection`   | Allows potentially-expensive [GraphQL schema introspection](/docs/graphql/basic-queries#overview) queries                        |
| `terminology`             | Enable full standards-compliant implementation for the [`ValueSet/$expand` operation](/docs/api/fhir/operations/valueset-expand) |
| `websocket-subscriptions` | Allows setting up a [Subscription](/docs/subscriptions) over Websockets                                                          |
| `transaction-bundles`     | Use strong database transaction isolation for `transaction` Bundles                                                              |

## Project system settings

The supported options that can be specified by a Super Admin in `Project.systemSetting`:

| systemSetting                  | Type    | Description                                                                                                                                                               | Default |
| ------------------------------ | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| `authRateLimit`                | integer | The maximum requests per minute allowed for authentication endpoints per IP address                                                                                       | 160     |
| `graphqlBatchedSearchSize`     | integer | For some GraphQL nested searches, the maximum number of searches to batch per SQL query                                                                                   | 0       |
| `graphqlMaxDepth`              | integer | The maximum allowed depth of a GraphQL query                                                                                                                              | 12      |
| `graphqlMaxSearches`           | integer | The maximum number of searches allowed in a GraphQL query                                                                                                                 | none    |
| `legacyFhirJsonResponseFormat` | boolean | If true, plain JSON formatting is incorrectly used instead of [FHIR JSON](https://hl7.org/fhir/R4/json.html) for some responses with content type `application/fhir+json` | false   |
| `rateLimit`                    | integer | The maximum requests per minute allowed per IP address                                                                                                                    | 60000   |
| `userFhirQuota`                | integer | The maximum number of FHIR interactions that can be performed in a minute by any single User in the project. See [Fhir Interaction Quota](/docs/rate-limits#fhir-interaction-load-rate-limit). To enforce, set `enableFhirQuota` to true. | 50000   |
| `totalFhirQuota`               | integer | Similar to `userFhirQuota`, but calculated as a sum of all Users' FHIR interactions in the project. To enforce, set `enableFhirQuota` to true.                                                                 | 500000  |
| `enableFhirQuota`              | boolean | If true, the totalFhirQuota limit will be enforced, returning ```429 Too Many Requests``` errors when the limit is exceeded over a minute. Please note that as of `v4.1.6`, FHIR quotas are enabled by default.                                                                                                 | true  |
| `searchOnReader`               | boolean | If true, FHIR search requests (except in batch requests) are served by the reader database pool if available                                                              | false   |

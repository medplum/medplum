---
id: project-settings
title: Project Settings
weight: 610
---

Many settings are also available at the Project level, allowing them to be configured for specific tenants on the server
rather than globally. Only Super Admin users are allowed to edit Project settings.

Additional details are available in the full [`Project` resource schema](/docs/api/fhir/medplum/project).

| Setting                      | Description                                                                                                                                                                                                                                                                                                                                | Default |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------- |
| `superAdmin`                 | Users belonging to a Project with this flag are granted [Super Admin](/docs/access/projects#superadmin) access to the server. Multiple Projects can have this set.                                                                                                                                                                         | `false` |
| `checkReferencesOnWrite`     | If `true`, the the server will reject any create or write operations to FHIR resources with a reference to a resource that does not exist.                                                                                                                                                                                                 | `false` |
| `features`                   | A list of optional features that are enabled for the project. Possible values are listed [below](#project-feature-flags).                                                                                                                                                                                                                  |         |
| `defaultPatientAccessPolicy` | Deprecated. Prefer the `Patient` entry in `defaultAccessPolicies`. Used only when that entry is absent, for patient invites, [SCIM](/docs/api/scim/users) patient provisioning, and [open patient registration](/docs/user-management/open-patient-registration). Open registration also requires the `openPatientRegistration` setting. |         |
| `link`                       | Additional Projects whose [contents should be accessible](/docs/access/projects#project-linking) to users in the current Project.                                                                                                                                                                                                          |         |
| `defaultProfile`             | [Resource profiles](http://hl7.org/fhir/R4/profiling.html#resources) that will be added to resources written in the Project that do not specify a profile directly. This enables automatic custom resource validation. See [Default Profiles](/docs/access/projects#default-profiles) for details and examples.                                                                                                                                                                                     |         |
| `setting`                    | Arbitrary key-value pairs available to anyone in the Project, can be set by Project Admins.                                                                                                                                                                                                                                                |         |
| `secret`                     | Key-value pairs similar to `setting`, that can only be read by Project Admins. These can be used to [pass secrets to Bots](/docs/bots/bot-secrets)                                                                                                                                                                                         |         |
| `systemSetting`              | Server settings related to the Project: visible to anyone, but can only be set by Super Admins.                                                                                                                                                                                                                                            |         |
| `systemSecret`               | Key-value pairs that can only be accessed by Super Admins.                                                                                                                                                                                                                                                                                 |         |

## Project feature flags

Medplum server exposes settings to control access to specific features on a per-Project basis. The available features
are:

| Feature                   | Description                                                                                                                      |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `bots`                    | Project is allowed to create and run [Bots](/docs/bots/bot-basics)                                                               |
| `cron`                    | Can run Bots periodically on [CRON timers](/docs/bots/bot-cron-job)                                       |
| `email`                   | Bots in this project can [send emails](/docs/sdk/core.medplumclient.sendemail)                                                   |
| `google-auth-required`    | [Google authentication](/docs/auth/google-auth) is the only method allowed                                                       |
| `graphql-introspection`   | Allows potentially-expensive [GraphQL schema introspection](/docs/graphql) queries                                               |
| `terminology`             | Enable full standards-compliant implementation for the [`ValueSet/$expand` operation](/docs/api/fhir/operations/valueset-expand) |
| `websocket-subscriptions` | Allows setting up a [Subscription](/docs/subscriptions) over Websockets                                                          |
| `transaction-bundles`     | Enable atomic processing of transaction Bundles in a self-hosted deployment. Unavailable on hosted Medplum. See [configuration and limits](#atomic-transaction-bundles). |
| `range-search`            | Date searches compare the full period or range. See [Searching by due date range](/docs/careplans/tasks#searching-by-due-date-range). |

### Atomic transaction Bundles

Atomic transaction processing is currently unavailable on Medplum-hosted deployments. Self-hosted operators can enable `transaction-bundles` in `Project.features` using a super administrator account.

Enable this only for workflows that require several writes to commit together or all roll back. Transactions can increase database contention and affect other workloads. Test the actual resource mix, concurrency, and failure recovery before enabling the feature in production. Prefer batches of conditional upserts when partial results can be reconciled.

Without the flag, `type: "transaction"` is processed with batch semantics, without a warning or rollback of successful entries. A `transaction-response` label does not establish atomicity. See [FHIR Batch Requests](/docs/fhir-datastore/fhir-batch-requests#batches-vs-transactions).

Transactions have these limits; requests that exceed them are rejected with `400 Bad Request`:

- At most **50 update operations**.
- Transactions containing conditional creates, updates, or deletes use serializable isolation and are limited to **8 entries**.
- Atomic transactions must be synchronous. Requests with `Prefer: respond-async` are rejected when this feature is enabled.

Keep each transaction limited to the resources that must commit together. Do not replace conditional writes with search-then-create to avoid the limits: another writer can change the result between the search and the write.

## Project system settings

The supported options that can be specified by a Super Admin in `Project.systemSetting`:

| systemSetting                  | Type    | Description                                                                                                                                                                                                                               | Default |
| ------------------------------ | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| `authRateLimit`                | integer | The maximum requests per minute allowed for authentication endpoints per IP address                                                                                                                                                       | 160     |
| `graphqlBatchedSearchSize`     | integer | For some GraphQL nested searches, the maximum number of searches to batch per SQL query                                                                                                                                                   | 0       |
| `graphqlMaxDepth`              | integer | The maximum allowed depth of a GraphQL query                                                                                                                                                                                              | 12      |
| `graphqlMaxSearches`           | integer | The maximum number of searches allowed in a GraphQL query                                                                                                                                                                                 | none    |
| `legacyFhirJsonResponseFormat` | boolean | If true, plain JSON formatting is incorrectly used instead of [FHIR JSON](https://hl7.org/fhir/R4/json.html) for some responses with content type `application/fhir+json`                                                                 | false   |
| `rateLimit`                    | integer | The maximum requests per minute allowed per IP address                                                                                                                                                                                    | 60000   |
| `userFhirQuota`                | integer | The maximum number of FHIR interactions that can be performed in a minute by any single User in the project. See [Fhir Interaction Quota](/docs/rate-limits#fhir-interaction-load-rate-limit). To enforce, set `enableFhirQuota` to true. | 50000   |
| `totalFhirQuota`               | integer | Similar to `userFhirQuota`, but calculated as a sum of all Users' FHIR interactions in the project. To enforce, set `enableFhirQuota` to true.                                                                                            | 500000  |
| `enableFhirQuota`              | boolean | If true, the totalFhirQuota limit will be enforced, returning `429 Too Many Requests` errors when the limit is exceeded over a minute. Please note that as of `v4.1.6`, FHIR quotas are enabled by default.                               | true    |
| `searchOnReader`               | boolean | If true, FHIR search requests (except in batch requests) are served by the reader database pool if available                                                                                                                              | false   |
| `chainedSearchOnReader`        | boolean | If true, FHIR search requests with chained search parameters (except in batch requests) are served by the reader database pool if available                                                                                               | false   |
| `redactAuditEvents`            | boolean | If true, remove human-readable detail strings from AuditEvent resources saved to the database and logs                                                                                                                                    | false   |

## Open patient registration

Set the `openPatientRegistration` key in `Project.setting` to `valueBoolean: true` to allow patients to self-register. The project must also have a Patient access policy: the `Patient` entry in `defaultAccessPolicies`, or the deprecated `defaultPatientAccessPolicy` when that entry is absent. Self-registered patients receive that policy. A Patient policy without `openPatientRegistration` set to `true` does not enable registration. See [Open Patient Registration](/docs/user-management/open-patient-registration).

## Multi-factor authentication

Set the `mfaRequired` key in `Project.setting` to `valueBoolean: true` to require MFA for all existing and new users who
sign in to the Project with a username and password. Users who have not enrolled will be required to enroll during their
next password login. This project-wide requirement takes precedence over an individual user's `User.mfaRequired` value;
setting the user value to `false` does not create an exception. See
[Requiring MFA for all Project users](/docs/auth/mfa#requiring-mfa-for-all-project-users) for configuration examples and
details.

The MFA methods users in a Project can enroll in are controlled by the `allowedMfaMethods` key in `Project.setting`, a comma-delimited list of `totp` and/or `email`. When unset, only authenticator-app (TOTP) MFA is offered. See [Configuring allowed MFA methods](/docs/auth/mfa#configuring-allowed-mfa-methods) for details and examples, including how to enable email-based MFA.

The `appName` key in `Project.setting` white-labels the MFA content Medplum generates: emailed verification codes and the authenticator app entries created by enrollment QR codes. When unset, both name Medplum. See [Branding MFA emails and authenticator apps](/docs/auth/mfa#branding-mfa-emails-and-authenticator-apps).

## Project SMTP

Projects can send email through their own SMTP relay instead of the server-wide email provider, configured via `Project.secret` entries. See [Project SMTP](/docs/user-management/project-smtp) for the full configuration reference. Operators can disable this fleet-wide with the [`allowProjectSmtp`](/docs/self-hosting/server-config#allowprojectsmtp) server config setting.

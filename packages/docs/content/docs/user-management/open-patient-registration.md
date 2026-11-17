---
id: open-patient-registration
title: Open Patient Registration
---

## Introduction

Most patient facing healthcare apps ask patients to self-enroll through a registration flow.

Medplum projects can be easily configured to allow open patient registration so that patients can sign up for Medplum accounts without being invited by a project administrator.

## Enabling Open Patient Registration

Open registration stays off until the project opts in and has a Patient access policy:

1. **Turn on `openPatientRegistration`** - Add an entry to [`Project.setting`](/docs/self-hosting/project-settings) with `name` `openPatientRegistration` and `valueBoolean` `true`.
2. **Set the Patient access policy** - Self-registered patients receive the `Patient` entry in [`Project.defaultAccessPolicies`](/docs/access/access-policies#default-access-policies). New projects already have that entry, scoped to the patient's own data. Replace it to use a different [`AccessPolicy`](/docs/api/fhir/medplum/accesspolicy). If the `Patient` entry is absent, registration falls back to the deprecated `Project.defaultPatientAccessPolicy` field.

Anyone who knows the project ID can then register as a Patient and receives that policy. To turn open registration off, set `openPatientRegistration` to `false` or remove it. Removing the Patient policy also turns it off. Changes affect future registrations only, not existing patients.

```json
{
  "resourceType": "Project",
  "setting": [
    {
      "name": "openPatientRegistration",
      "valueBoolean": true
    }
  ],
  "defaultAccessPolicies": [
    {
      "profileType": "Patient",
      "accessPolicy": { "reference": "AccessPolicy/example-patient-policy" }
    }
  ]
}
```

{{< note >}}

`defaultPatientAccessPolicy` is deprecated. Open registration, [patient invites](/docs/app/invite) that omit an access policy, and [SCIM](/docs/api/scim/users) patient provisioning all prefer the `Patient` entry in `defaultAccessPolicies`, and use `defaultPatientAccessPolicy` only when that entry is absent. The `openPatientRegistration` setting is what turns self-registration on. A Patient policy by itself does not. Invites and SCIM do not require the setting. SCIM refuses to create a Patient when neither policy is set.

{{< /note >}}

# Open Patient Registration

## Introduction

Most patient facing healthcare apps ask patients to self-enroll through a registration flow.

Medplum projects can be easily configured to allow open patient registration so that patients can sign up for Medplum accounts without being invited by a project administrator.

## Enabling Open Patient Registration

To enable open patient registration:

1. **Create a Patient [`AccessPolicy`](/docs/api/fhir/medplum/accesspolicy)** - Open registration requires patients to have an access policy to restrict them to only viewing their own data. It should prevent them from accessing data for other patients and sensitive system level resources like [`AccessPolicy`](/docs/api/fhir/medplum/accesspolicy). See [this example](/docs/access/access-policies#patient-access) for a good starting point for a patient access policy.
2. **Set the [`AccessPolicy`](/docs/api/fhir/medplum/accesspolicy) as the default** - Navigate to https://app.medplum.com/Project and select your project. In the "Edit" tab, set the "Default Patient Access Policy" field to your new policy and click "Update".

Once the field is set, anyone who knows your project ID can register as a Patient and will be given that policy. To turn open registration off, clear the field. Changing it affects future registrations only, not existing patients.

:::note

The "Default Patient Access Policy" field is separate from [`Project.defaultAccessPolicies`](/docs/access/access-policies#default-access-policies). `defaultAccessPolicies` only applies when an administrator [invites](/docs/app/invite) a user without choosing a policy, and it does not enable or affect open registration. If you use both invites and open registration, set both to the same Patient policy so invited and self-registered patients get the same access.

:::

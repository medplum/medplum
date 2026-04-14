# Open Patient Registration

## Introduction

Most patient facing healthcare apps ask patients to self-enroll through a registration flow.

Medplum projects can be easily configured to allow open patient registration so that patients can sign up for Medplum accounts without being invited by a project administrator.

## Enabling Open Patient Registration

To enable open patient registration:

1. **Create a Patient [`AccessPolicy`](/docs/api/fhir/medplum/accesspolicy)** — Open registration requires patients to have an access policy to restrict them to only viewing their own data, prevent them from accessing data for other patients, and block sensitive system resources such as [`AccessPolicy`](/docs/api/fhir/medplum/accesspolicy). See [this example](/docs/access/access-policies#patient-access) for a good starting point.
2. **Configure a default on the [`Project`](/docs/api/fhir/medplum/project)** — The server must be able to attach that policy to each new patient [`ProjectMembership`](/docs/api/fhir/medplum/projectmembership) automatically. You can do either of the following (see [default access policies](/docs/access/projects#default-access-policies) for precedence):
   - **Recommended:** Set `defaultAccessPolicy` with a `Patient` row whose `access` array references your policy using [`ParameterizedAccess`](/docs/api/fhir/medplum/projectmembership) (for example a single entry with `policy` pointing at the `AccessPolicy` you created). This is the preferred model when you may add defaults for other profile types later.
   - **Legacy:** Set `defaultPatientAccessPolicy` to a reference to the same `AccessPolicy`. This field is deprecated but still honored when no `Patient` entry in `defaultAccessPolicy` applies.

In the Medplum App, open **Project → Edit** and use the FHIR fields above (the UI label may still say “Default Patient Access Policy” while the underlying resource supports both patterns).

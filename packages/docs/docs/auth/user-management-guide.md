---
sidebar_position: 2
tags: [auth]
---

# User Management Guide

This guide walks through how to **create and manage users** via the Medplum App and via API. Medplum supports multiple authentication options, but always maintains a representation of the user identities, and gives developers control over which authentication method to use for an identity, as well as what access controls are applied.

## Background: User Model

Medplum has several resources that represent user identities. The following resources are fundamental to building a correctly functioning application. This table describes how identities are represented in the system, and provides links to the administrative settings in the [Medplum App](https://app.medplum.com).

| Resource                                                      | Description                                                                                                                                                                                                                       | Medplum App                                                                                                              |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| User                                                          | A resource that represents a user identity. Users exist above the Project level and can only be self-updated.                                                                                                                     | None                                                                                                                     |
| Project                                                       | A [Project](/docs/tutorials/register#medplum-projects) is an isolated set of resources. With the exception of User, resources do not exist across Projects                                                                        | [Project Admin](https://app.medplum.com/admin/project)                                                                   |
| [ProjectMembership](/docs/api/fhir/medplum/projectmembership) | A ProjectMembership represents granting a user access to the resources within a Project. Inviting a user to a project, and specifying their `profile` and `accessPolicy` you can determine what set of resources they can access. | [Invite (Admins only)](https://app.medplum.com/admin/invite), [Users (Admins only)](https://app.medplum.com/admin/users) |

The resources below serve as modifier to the ProjectMembership resource (i.e. `ProjectMembership.profile`) that enable sophisticated access controls. The `ProjectMembership.accessPolicy` may rely on the `ProjectMembership.profile` resource.

| Resource      | Description                                                                                                                             | Medplum App                                            |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Patient       | Patient is a fundamental FHIR resource and linking it to an identity allows the simple use case of granting access to personal records. | [Patients](https://app.medplum.com/Patient)            |
| Practitioner  | Practitioners are staff members of a healthcare organization and generally have access to multiple patients' data.                      | [Practitioner](https://app.medplum.com/Practitioner)   |
| RelatedPerson | RelatedPerson is a family member or caregiver of a patient, who may be granted access to a small number of patient records              | [RelatedPerson](https://app.medplum.com/RelatedPerson) |

There are several `ProjectMembership.profile` resources that are related to programmatic access, which serve as modifiers to the ProjectMembership resource (i.e. `ProjectMembership.profile`) and do not represent people, but rather applications that access data. This table describes the programmatic access profiles with links on where to set them up in the Medplum App.

| Resource          | Description                                            | Medplum App                                                  |
| ----------------- | ------------------------------------------------------ | ------------------------------------------------------------ |
| ClientApplication | API Keys that allow programmatic access to resources   | [Client Applications](https://app.medplum.com/admin/clients) |
| Bot               | Event driven [custom functions](/docs/bots/bot-basics) | [Bots](https://app.medplum.com/Bot)                          |

## User Administration via Medplum App

Users in Medplum can be members of multiple projects, so cannot be edited directly. You'll need to invite a user to a project in order to grant access. If the user does not exist, it will be created when invited.

### Creating Memberships

Only administrators can invite users, and can do so on the [Invite](https://app.medplum.com/admin/invite) page. You can specify a role and [AccessPolity](/docs/auth/access-control) at time of invite. The invite flow will do the following:

1. Create a `User` if one does not already exist
2. Create a FHIR resource (Patient, Practitioner or RelatedPerson)
3. Create a ProjectMembership that links User, ProfileResource and access policy
4. (Optional) send an email invite user

:::caution Note

Do not delete Patient, Practitioner or RelatedPerson resources that belong to ProjectMemberships. This will cause the login to be non-functional. Do not edit or change the ProjectMembership resources directly.

:::

### Removing Memberships

Tor remove users from the existing project navigate to your [Project settings](https://app.medplum.com/admin/project) and to the Users and Patient tabs respectively. Click on a specific users or patients and click **Remove User**.

We highly recommend leaving the associated FHIR resource (Patient, Practitioner, etc.) in place for audibility, record keeping and in case the membership needs to be reonstructed for some reason.

## Invite via API

Inviting users can be done programmatically using the `/invite` endpoint

Prepare JSON payload:

```json
{
  "resourceType": "Patient",
  "firstName": "Homer",
  "lastName": "Simpson",
  "resourceType": "Patient",
  "email": "homer@example.com",
  "sendEmail": false
}
```

Then POST to the `/invite` endpoint:

```bash
curl 'https://api.medplum.com/admin/projects/${projectId}/invite' \
  -H 'Authorization: Bearer ${accessToken}' \
  -H 'Content-Type: application/json' \
  --data-raw '{"resourceType":"Patient","firstName":"Homer","lastName":"Simpson","email":"homer@example.com", "sendEmail":"false"}'
```

:::caution

Creating Practitioners via API is an advanced scenario and should be done with extreme caution. If you are planning to do programmatic creation of Practitioners, we highly recommend trying it in a test environment first and ensuring that the logins and associated access controls behave as expected.

:::

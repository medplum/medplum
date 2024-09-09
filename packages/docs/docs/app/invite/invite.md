---
sidebar_position: 3
---

# Invite a user

This guide explains how to invite another user to your Medplum project.

import adminUsersPage from './admin-users-page.png'

<img alt="Admin Users Page" src={adminUsersPage} style={{maxWidth: "75%"}}/>

1. Open the Medplum app in your browser: https://app.medplum.com/. If you don't have an account yet, see the [Register](../tutorials/register) page.
2. Navigate to the [Project Admin](https://app.medplum.com/admin/project) page at [https://app.medplum.com/admin/project](https://app.medplum.com/admin/project).
3. Click on the "Users" tab.
4. Click on the "Invite new user" link at the bottom of the screen.

import inviteNewUser from './invite-new-user.png'

<img alt="Invite New User" src={inviteNewUser} style={{maxWidth: "75%"}}/>

5. Select the new user's Role. A user's role defines which FHIR resource type represents the user in this project, and can take one of the following values:
   1. **Practitioner:** This is the most common profile type. Applies to any user who is involved in administering care, including physicians, technicians, engineers, IT staff, and customer service representatives.
   2. **Patient:** This is the profile for any users who are the beneficiary of care.
   3. **RelatedPerson:** This profile represents users who are related to a patient and need access to some of their clinical data, but who don't benefit directly from care. This is typically used for parents/guardians for pediatric patients, or spouses of patients who aren't being treated themselves.
6. Fill in the user details such as first name, last name, and email address.
7. For advanced security features, you can configure an [AccessPolicy](/docs/access/access-policies). An AccessPolicy allows you to specify which resource types users can read and write.
8. By default, Medplum will send a welcome email to the new user. You can toggle the "Send email" checkbox if you do not want to send an email. (You may also be interested in [Custom Emails](/docs/auth/custom-emails)).
9. You can optionally add the new user as a Project Administrator by checking the "Admin" checkbox. See the [User Admin Guide](https://www.medplum.com/docs/auth/user-management-guide#user-administration-via-medplum-app) for more details and how to do this using the API.
10. Click "Invite" when the user details are ready.

When you click "Invite", the system will send an email to the user with instructions how to activate their new account.

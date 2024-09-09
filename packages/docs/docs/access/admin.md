# Admin Users

Certain operations require Medplum [Users](/docs/api/fhir/medplum/user), [`Bots`](/docs/api/fhir/medplum/bot), or [`ClientApplications`](/docs/api/fhir/medplum/clientapplication) to have administrative privileges. Users can be granted admin rights on a per-project basis: a given user can be an admin for one project, but not another.

Medplum distinguishes between two different types of admin user: **project admin** and **super admin**.

## Project Admin

A project (or tenant) level user. This is the most common type of admin user at an organization.

See our [User Management Guide](/docs/auth/user-management-guide#promote-existing-user-to-admin) for more information on how to grant project admin privileges.

Project Admins have the following privileges:

- **Invite / remove users** - See our [User Management Guide](/docs/auth/user-management-guide) for mor information
- **Create Bots** - See our guide on [Bots](/docs/bots/bot-basics) to learn how to create and write Bots
- **Write the `meta.account` element** - Every resource has a `meta.account` property that can be used for advanced access control scenarios. See our guide on [access policies](/docs/access/access-policies) for more information.
- **View Administrative Resources** - The following Medplum resource types are only accessible to project admin [Users](/docs/api/fhir/medplum/user), [`Bots`](/docs/api/fhir/medplum/bot), or [`ClientApplications`](/docs/api/fhir/medplum/clientapplication):
  - [`Project`](/docs/api/fhir/medplum/project) - used to adjust [Project settings](/docs/access/projects#settings)
  - [`ProjectMembership`](/docs/api/fhir/medplum/projectmembership) - used to manage user registration and privileges (see: [User Management Guide](/docs/auth/user-management-guide))
  - [`PasswordChangeRequest`](/docs/api/fhir/medplum/passwordchangerequest) - used to [send custom emails](/docs/auth/custom-emails#password-change-request-bot)
  - [`User`](/docs/api/fhir/medplum/user) - only for [project scoped users](/docs/auth/user-management-guide#project-scoped-users)

:::note Applying Access Policies to Admins

If you want to limit these privileges, you can apply Access Policies to your Admin users. See the [Access Policies docs](/docs/access/access-policies) for more details.

:::

## Super Admin

A super admin user has an increased level privileges for performing server-level operations. **This level of privilege can cause irreparable data changes, and should be limited to system administrators.**

To grant a user super admin privilege, invite them to the Super Admin project (see [this guide](/docs/access/projects#superadmin) for more details).

Project Admins have the following privileges:

- **Overwrite all resource fields** - Super admin users bypass all data validation checks, and can edit protected fields like `id` and `meta` properties.
- **Rebuild shared data structures** - Certain shared resources, such as `StructureDefinitions` and `ValueSets`, sometimes need to be built after some server updates. See the [Super Admin Guide](/docs/self-hosting/super-admin-guide) for more details.
- **Create projects via API** - Because [`Projects`](/docs/api/fhir/medplum/project) are system-level resources, creating them via API requires the creation of a Super Admin [`ClientApplication`](/docs/api/fhir/medplum/clientapplication)

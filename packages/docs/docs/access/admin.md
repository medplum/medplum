## Admin Users

Certain operations require Medplum users, [`Bots`](), or [`ClientApplications`]() to have administrative privileges. User's can be granted admin rights on a per-project basis; a given user can be an admin for one project, but not another.

Medplum distinguishes between two different types of admin user: **project admin** and **super admin**.

## Project Admin

A project (or tenant) level user. This is the most common type of admin user at an organization.

See our [User Management Guide]() for more information on how to grant project admin privileges.

Project Admins have the following privileges:

- **Invite / remove users** - See our [User Management Guide]() for mor information
- **Create Bots** - See our guide on [Bots]() to learn how to create and write Bots
- **Write the `meta.account` element** - Every resource has a `meta.account` property that can be used for advanced access control scenarios. See our guide on [access policies]() for more information.
- **View Administrative Resources** -

## Super Admin

A super admin user has an increased level privileges for performing server-level operations. **This level of privilege can cause irreparable data changes, and should be limited to system administrators.**

To grant a user super admin privilege, invite them to the Super Admin project (see [this guide]() for more details).

Project Admins have the following privileges:

- **Overwrite all resource fields** - Super admin users bypass all data validation checks, and can edit protected fields like `id` and `meta` properties.
- Rebuild shared data structures
- Create projects via API

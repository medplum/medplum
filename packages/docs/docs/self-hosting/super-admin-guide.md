---
sidebar_position: 6
---

# Super Admin Guide

When self-hosting a Medplum server, you will have access to a "Super Admin" project. When you sign in as a member of the "Super Admin" project, you will have access to very powerful super admin privileges.

:::danger

Super admin features can cause unrepairable damage. Proceed with caution. With great power comes great responsibility!

:::

## Protected Resources

Medplum uses custom FHIR resource types to manage user accounts and project administration. While these are not official FHIR resources, Medplum uses the same FHIR semantics: the same RESTful operations, same search capabilities, `StructureDefinition` resources, `SearchParameter` resources, etc.

The most important custom resource types are:

- `User` - represents a user account capable of logging into the system
- `Project` - represents a project which contains other resources
- `ProjectMembership` - link between a `User` and a `Project` which also defines `AccessPolicy` and `UserConfiguration`
- `Login` - an authentication event and session state

## Server Maintenance

From time to time, you may need to perform system level maintenance. The Medplum app has a special "Super Admin" page to make it easier to perform these tasks. You can find the "Super Admin" page at `/admin/super`.

:::note

In the future, we hope that most of this maintenance will be 100% automatic and behind the scenes. For now, it is important that you understand this maintenance for system health.

:::

### Rebuild Resources

In the "Super Admin" page, there are buttons and sections for:

- Rebuild Structure Definitions
- Rebuild Search Parameters
- Rebuild Value Sets

From time to time, Medplum will make changes to custom resources. The server runtime uses `StructureDefinition` and `SearchParameter` files directly from disk. However, the client requests `StructureDefinition` resources to dynamically generate client-side UI elements such as search filters, the "Details" page, and the "Edit" page. If a Medplum changes these resources, you may need to rebuild the index before you see the changes in the client.

### Reindex Resources

From time to time, Medplum makes changes to the underlying search indexing logic. This usually happens when adding support for new FHIR search capabilities. Resource indexes are updated automatically on every `create` or `update` operation. Use the "Reindex Resources" button to reindex existing resources.

### Rebuild Compartments

From time to time, Medplum makes changes to the underlying compartment logic. This can happen when adding enhancements to compartment features, or new compartment definitions. Compartments are updated automatically on every `create` or `update` operation. Use the "Rebuild Compartments" button to rebuild compartments for all existing resources.

### Purge Resources

Some system generated resources can accumulate and lead to degraded performance. Use the "Purge Resources" form to permanently delete resources from the database. Note that this operation is a true `DELETE`, and not the normal "soft delete", so this is permanent. Medplum recommends backing up all data, or synchronizing data to a data warehouse before using this feature.

### Force Set Password

User accounts are global, and can be members of multiple projects. Therefore, normal project administrators do not have access to "Set Password" functionality. Use the "Force Set Password" button to forcefully override a user's password.

[Video Tutorial](https://youtu.be/jw1NZbk5WmA)

### Inviting Users to Projects

When logged in as super admin you can invite users to any project. To do so navigate to the `admin/invite` page. The first field on the page will allow you to specify which project you want to invite a user to as well as whether you want them to be an admin. This functionality is also available via the [API](/docs/auth/user-management-guide#invite-via-api).

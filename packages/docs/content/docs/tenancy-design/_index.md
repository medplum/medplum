---
id: index
title: Tenancy Design
description: Implement your application's Patient model, tenant permissions, and account experience.
---

Implement tenancy for your application built on Medplum.

{{< tip title="Choosing your tenancy design?" >}}
Start with the [Tenancy Design Decision Guide](/docs/decision-guides/tenancy-design) to decide whether you need multi-tenancy, what each tenant represents, what stays independent, and how people work across tenants.
{{< /tip >}}

## Implementation sequence

| Step | Technical guide | What you configure |
| :--- | :--- | :--- |
| **1. Patient and clinical records** | [Patient Records and Clinical Sharing](/docs/tenancy-design/patient-records) | One shared Patient per person or a separate Patient per tenant; clinical sharing and record lifecycle. |
| **2. Assignment and permissions** | [Tenant Assignment and Access](/docs/access/multi-tenant-access-policy) | Resources representing tenants or finer groups, account assignments, and policy grants. |
| **3. Accounts and sessions** | [Identity, Memberships, and Sessions](/docs/access/tenant-selector) | One account with separate practice sessions, one account with access across practices, or independent practice accounts. |

For **a separate project per tenant**, start with [Projects](/docs/access/projects#project-per-customer-tenancy). This model requires self-hosting. Configure each project's required permissions, then plan accounts and sessions across projects.

## Related foundations

[Projects](/docs/access/projects) explains resource containers and project administration. [Access Policies](/docs/access/access-policies) defines resource and field permissions; use the [Access Control Decision Guide](/docs/decision-guides/access-control) to choose them.

With or without tenants, UI filters can organize work using existing fields and relationships; compartments are optional. When care-team restrictions must apply at the API level, use matching policies. Within a tenant, [combine practice and care-team restrictions](/docs/access/multi-tenant-access-policy#layering-tenant-and-care-team-access) when both are required.

Use [Organizations and Locations](/docs/administration/locations-and-facilities) to model your operating structure, and [Authentication](/docs/auth) and [User Management](/docs/user-management) for sign-in and account provisioning.

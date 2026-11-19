---
id: index
title: Authorization and Access Control
---

{{< tip title="Planning this workflow?" >}}
The [Access Control Decision Guide](/docs/decision-guides/access-control) walks through role scopes, permissions, and administration, with or without multi-tenancy. If your application needs separate tenant boundaries, choose the tenant and Patient model in the [Tenancy Design Decision Guide](/docs/decision-guides/tenancy-design).
{{< /tip >}}

This section covers Medplum's _authorization_ tools. Medplum supports a rich set of primitives to provide fine-grained control over what data users can access and what operations they can perform.

The key concept is the [`AccessPolicy`](/docs/api/fhir/medplum/accesspolicy) resource, which restricts read and write access to FHIR data on a per-resource-type or per-field basis. Every user or client application can be assigned an `AccessPolicy` that defines exactly which resources they can see and modify.

- [Projects](/docs/access/projects) – Understand resource boundaries, administration, and project settings
- [Access Policies](/docs/access/access-policies) – Set up resource-level and field-level access control
- [IP Address Rules](/docs/access/ip-access-rules) – Restrict access based on the user's IP address
- [SMART Scopes](/docs/access/smart-scopes) – Support for [SMART-on-FHIR](https://docs.smarthealthit.org/) applications

For application tenancy design using these building blocks, see [Tenancy Design](/docs/tenancy-design). It brings together shared or tenant-specific Patients, tenant assignment, and session choices for applications serving multiple groups.

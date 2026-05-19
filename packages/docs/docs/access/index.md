# Authorization and Access Control

This section covers Medplum's _authorization_ tools. Medplum supports a rich set of primitives to provide fine-grained control over what data users can access and what operations they can perform.

The key concept is the [`AccessPolicy`](/docs/api/fhir/medplum/accesspolicy) resource, which restricts read and write access to FHIR data on a per-resource-type or per-field basis. Every user or client application can be assigned an `AccessPolicy` that defines exactly which resources they can see and modify.

- [Access Policies](/docs/access/access-policies) — Set up resource-level and field-level access control
- [IP Address Rules](/docs/access/ip-access-rules) — Restrict access based on the user's IP address
- [SMART Scopes](/docs/access/smart-scopes) — Support for [SMART-on-FHIR](https://docs.smarthealthit.org/) applications

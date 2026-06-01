# Authorization and Access Control

:::tip[Planning this workflow?]
The [Access Control Decision Guide](https://docs.google.com/document/d/e/2PACX-1vRcV1ABmOEoVk8hqKir8pBbxaN9iYSO64Jls35_x7ueCzpyp6CKkdNdA5LNRQKKmF_sX8gB_-z7gX69/pub) walks through requirements questions and FHIR modeling decisions for access control — use it alongside these docs.
:::

This section covers Medplum's _authorization_ tools. Medplum supports a rich set of primitives to provide fine-grained control over what data users can access and what operations they can perform.

The key concept is the [`AccessPolicy`](/docs/api/fhir/medplum/accesspolicy) resource, which restricts read and write access to FHIR data on a per-resource-type or per-field basis. Every user or client application can be assigned an `AccessPolicy` that defines exactly which resources they can see and modify.

- [Access Policies](/docs/access/access-policies) — Set up resource-level and field-level access control
- [IP Address Rules](/docs/access/ip-access-rules) — Restrict access based on the user's IP address
- [SMART Scopes](/docs/access/smart-scopes) — Support for [SMART-on-FHIR](https://docs.smarthealthit.org/) applications

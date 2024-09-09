# Authorization and Access Control

This section covers Medplum's _authorization_ tools. Medplum supports a rich set of primitives to provide fine grained control over what data users can access, and what operations the can perform.

The [`AccessPolicy`](/docs/api/fhir/medplum/accesspolicy) resource can be used to restrict read and write access to FHIR data, either on a per-resource type or per-field basis. The [access policy guide](/docs/access/access-policies) covers the basics of setting up  [`AccessPolicies`](/docs/api/fhir/medplum/accesspolicy).

[`AccessPolicies`](/docs/api/fhir/medplum/accesspolicy) can also be used to restrict access based on the user's IP address, which is described in the [IP Address Rules](/docs/access/ip-access-rules) guide. 

Medplum also supports [SMART scopes](/docs/access/smart-scopes) for [SMART-on-FHIR](https://docs.smarthealthit.org/) applications.

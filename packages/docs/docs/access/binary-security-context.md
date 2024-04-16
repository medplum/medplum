# Binary Security Context

When managing access, the FHIR [`Binary`](/docs/api/fhir/resources/binary) resource is unique case. Access controls cannot be applied to [`Binary`](/docs/api/fhir/resources/binary) resources in the same way as other resources, so you must use the `Binary.securityContext` element to add access policies.

The `securityContext` element is a reference to another resource that acts as a proxy for the access controls of that [`Binary`](/docs/api/fhir/resources/binary). For example, if the `securityContext` references a [`Patient`](/docs/api/fhir/resources/patient), then the [`Binary`](/docs/api/fhir/resources/binary) will only be viewable by users and resources that have read access to that [`Patient`](/docs/api/fhir/resources/patient).

Below is an example of a simiple [`Binary`](/docs/api/fhir/resources/binary) resource with a `securityContext` that references a [`Patient`](/docs/api/fhir/resources/patient).

```json
{
  "resourceType": "Binary",
  "securityContext": { "reference": "Patient/homer-simpson" }
}
```

For more details on how [`Binary`](/docs/api/fhir/resources/binary) resources are used in FHIR, see the [Binary Data docs](/docs/fhir-datastore/binary-data).

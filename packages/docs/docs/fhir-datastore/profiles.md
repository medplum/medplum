---
id: profiles
toc_max_heading_level: 5
sidebar_position: 6
---

# Profiles

FHIR provides a broad variety of resources types to cover as many different types of healthcare data as possible,
favoring generality over specificity. For example, the `Observation` resource type is used to record many different
kinds of data: a patient's smoking status might be recorded using the `valueCodeableConcept` field, while the
measurement data for blood pressure would exist as two separate entries under `component.valueQuantity`. In order to
allow for "subclassing" a more general resource type to meet a particular use case, FHIR uses [resource profiles][profiling]
to layer additional validation rules onto the base specification for a resource type.

Profiles are used heavily in FHIR to ensure that resources sent between servers conform to a minimum set of required
fields. For example, the [US Core Blood Pressure profile][us-core-bp] requires that `component` contains two
correctly-coded entries: one systolic pressure measurement, and one diastolic measurement. If a resource under
this profile contains just one measurement, or uses an incorrect code for either component, it will be rejected by the
server. This helps ensure data quality by preventing data that does not match the expected schema from being written.

Profiles can be used both for enforcing an internal schema (i.e. an organization's own data quality rules), or for
external consumers (i.e. to validate that data will be acceptable to a third-party FHIR API). In the United States,
the [US Core profiles][us-core] specify a minimum set of required data (called [USCDI][uscdi]) for interoperating with
other US healthcare entities.

[profiling]: http://hl7.org/fhir/profiling.html
[us-core-bp]: http://hl7.org/fhir/us/core/StructureDefinition/us-core-blood-pressure
[us-core]: https://www.hl7.org/fhir/us/core/#us-core-profiles
[uscdi]: https://www.healthit.gov/isa/united-states-core-data-interoperability-uscdi

## Profile adoption

Using a pre-existing profile is simple: placing the canonical URL of the profile in a resource's `meta.profile` field
will cause the server to attempt to validate the resource against that profile when the resource is written.

```json
{
  "resourceType": "Patient",
  "meta": {
    "profile": ["http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient"]
  },
  // Normally Patient has no required fields, but under the US Core Patient profile,
  // all the data fields below are required
  "gender": "male",
  "identifier": [
    {
      "system": "http://example.com/mrn",
      "value": "12345"
    }
  ],
  "name": [
    {
      "given": ["John", "Jacob"],
      "family": "Jingleheimer-Schmidt"
    }
  ]
}
```

:::tip

The corresponding `StructureDefinition` resource for the profile (i.e. one with a `url` matching that in
`meta.profile`) must be present in your Project: make sure to upload the resource JSON for any profiles you
plan to use.

:::

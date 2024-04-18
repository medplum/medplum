---
id: profiles
toc_max_heading_level: 5
sidebar_position: 6
---

import MedplumCodeBlock from '@site/src/components/MedplumCodeBlock';
import ExampleCode from '!!raw-loader!@site/..//examples/src/fhir-datastore/profiles.ts';

# Profiles

FHIR provides a broad variety of resources types to cover as many different types of healthcare data as possible, favoring generality over specificity. For example, the `Observation` resource type is used to record many different kinds of data: a patient's smoking status might be recorded using the `valueCodeableConcept` field, while the measurement data for blood pressure would exist as two separate entries under `component.valueQuantity`.

To meet more specific use cases, FHIR allows developers to author [resource profiles][profiling] to layer additional validation rules onto the base specification for a resource type. This is similar to "subclassing" in object oriented programming languages.

Medplum developers can take advantage of FHIR profiles in the following ways:

1. Complying to a certain data quality standard. In the United States,
   the [US Core profiles][us-core] specify a minimum set of required data (called [USCDI][uscdi]) for interoperating with
   other US healthcare entities.
2. Enforcing an internal schema (i.e. an organization's own data quality rules),
3. Fulfilling data requirements of third-party APIs

For example, the [US Core Blood Pressure profile][us-core-bp] requires that `component` contains two
correctly-coded entries: one systolic pressure measurement, and one diastolic measurement. If a resource under
this profile contains just one measurement, or uses an incorrect code for either component, it will be rejected by the
server. This helps ensure data quality by preventing data that does not match the expected schema from being written.

[profiling]: http://hl7.org/fhir/profiling.html
[us-core-bp]: http://hl7.org/fhir/us/core/StructureDefinition/us-core-blood-pressure
[us-core]: https://www.hl7.org/fhir/us/core/#us-core-profiles
[uscdi]: https://www.healthit.gov/isa/united-states-core-data-interoperability-uscdi

## Creating Profiles

The schema for each FHIR resource type is defined by a [`StructureDefinition`](/docs/api/fhir/resources/structuredefinition) resource. By default, Medplum ships with [`StructureDefinitions`](/docs/api/fhir/resources/structuredefinition) for each FHIR base resource type and for Medplum defined resource types. The source data for these [`StructureDefinitions`](/docs/api/fhir/resources/structuredefinition) can be found the [@medplum/definitions](https://github.com/medplum/medplum/tree/main/packages/definitions) package.

FHIR profiles are also stored as [`StructureDefinÏition`](/docs/api/fhir/resources/structuredefinition) resources that inherit from the base schemas. You can create a new profile in your Medplum project simply by uploading the corresponding [`StructureDefinition`](/docs/api/fhir/resources/structuredefinition) to your project.

Authoring profiles from scratch can be complicated and time consuming. Many organizations publish **implementation guides** with collections for FHIR profiles, tailored to specific healthcare domains.

For example:

- [US Core](http://hl7.org/fhir/us/core/index.html): Establishing the “floor” of standards to promote interoperability throughout the US healthcare system.
- [PDex Payer Networks](https://build.fhir.org/ig/HL7/davinci-pdex-plan-net/): Health insurers' insurance plans, their associated networks, and the organizations and providers that participate in these networks.
- [US Drug Formulary](http://hl7.org/fhir/us/davinci-drug-formulary/): Health insurers' drug formulary information for patients/consumers.
- [Dental Data Exchange](http://hl7.org/fhir/us/dental-data-exchange/): Standards for bi-directional information exchange dental providers.

## Profile adoption

Using a pre-existing profile is simple: placing the canonical URL of the profile in a resource's `meta.profile` field
will cause the server to attempt to validate the resource against that profile when the resource is written. Normally,
the `Patient` resource type has no required fields, but the [US Core Patient profile][us-core-patient] specifies that
at least `name`, `gender`, and `identifier` must be populated. Uploading a profiled `Patient` resource without those
fields will produce an error:

```json
{
  "resourceType": "Patient",
  "meta": {
    "profile": ["http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient"]
  }
}
```

```json
{
  "resourceType": "OperationOutcome",
  "issue": [
    {
      "severity": "error",
      "code": "structure",
      "details": { "text": "Missing required property" },
      "expression": ["Patient.identifier"]
    },
    {
      "severity": "error",
      "code": "structure",
      "details": { "text": "Missing required property" },
      "expression": ["Patient.name"]
    },
    {
      "severity": "error",
      "code": "structure",
      "details": { "text": "Missing required property" },
      "expression": ["Patient.gender"]
    }
  ]
}
```

To satisfy the profile declared in `meta.profile`, values for the required fields must be included in the resource:

```json
{
  "resourceType": "Patient",
  "meta": {
    "profile": ["http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient"]
  },
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
  ],
  "gender": "male"
}
```

:::tip

The corresponding `StructureDefinition` resource for the profile (i.e. one with a `url` matching that in
`meta.profile`) must be present in your Project: make sure to upload the resource JSON for any profiles you
plan to use.

:::

[us-core-patient]: http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient

## Searching by Profile

You can use the `_profile` search parameter to retrieve all resources of a given type that conform to a certain FHIR profile.

Refer to the [Advanced Search Parameters](/docs/search/advanced-search-parameters#_profile) guide for more information.

## Handling missing data

Sometimes, a profile requires a field that cannot be populated due to missing data: the system may not have the required
data available, or it may be unknown. In these cases, the [Data Absent Reason extension][data-absent-ext] should be used
to satisfy the field presence requirement, while also denoting why the data is missing:

```json
{
  "resourceType": "Patient",
  "meta": {
    "profile": ["http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient"]
  },
  "identifier": [
    {
      "system": "http://example.com/mrn",
      "value": "12345"
    }
  ],
  // For fields with complex (object) data types, add the `extension` field where necessary to indicate absent data
  "name": [
    {
      "extension": [
        {
          "url": "http://hl7.org/fhir/StructureDefinition/data-absent-reason",
          "valueCode": "masked"
        }
      ]
    }
  ],
  // For primitive type fields, use the underscore-prefixed field name to add an object with the `extension` field
  "_gender": {
    "extension": [
      {
        "url": "http://hl7.org/fhir/StructureDefinition/data-absent-reason",
        "valueCode": "asked-declined"
      }
    ]
  }
}
```

[data-absent-ext]: http://hl7.org/fhir/StructureDefinition/data-absent-reason

## Updating Profiles

Updating FHIR profiles is different than updating other resources in FHIR. The process is more similar to a database migration, and the profiled resources will need to be revalidated once the update is complete. This revalidation does not happen automatically, but will be checked the next time the resource is written to.

This section offers some best practices to make updating profiles as smooth and painless as possible when using Mepdlum.

When updating a profile, you should create a _new_ [`StructureDefinition`](/docs/api/fhir/resources/structuredefinition) resource for the updated profile. This will be similar to the original, but it will have the changes you've made, as well as an udpated `version` field. The `version` element is used to track changes to profile over time.

Medplum does not currently fully implement versioning per the FHIR spec. Because of this, when updating a profile the version should also be included as a part of the url. This allows you to make changes to your profile without invalidating resources that do not yet comply to the updated profile.

For example, say you have a patient profile that requires patients to have an associated email address. The url for this profile would be `https://example.com/profiles/foo-patient/1.0.0`. In this example `foo-patient` is the name of the profile and `1.0.0` is the version.

You may want to update this profile to ensure that all patients also have an associated phone number. To do so, you would create a new [`StructureDefinition`](/docs/api/fhir/resources/structuredefinition) with the necessary changes. Additionally, you would update the url to `https://example.com/profile/foo-patient/2.0.0`. This is the same profile, but with the version updated to `2.0.0`.

:::note Semantic Versioning in Profiles

When updating FHIR profiles, you should use semantic versioning to assign values to your versions. This means the first number represents major changes, the second number represents minor changes, and the third number represents patches. In the above example, requiring a phone number is a breaking change as it may cause some resources to fail validation. Any breaking changes should be considered major changes. For more details, see the [Semver docs](https://semver.org/).

:::

Using versions allows resources to attest to different versions of the profile, so if a patient does not have a phone number they can still reference version `1.0.0` until they are updated. To check which resources need to be changed before updating their profile, you can use the [$validate operation](/docs/api/fhir/operations/validate-a-resource).

When you update a profile, you can loop over each resource, validate it, and update the profile if it passes. To help with this, Mepdlum provides the [`validateResource`](/docs/sdk/core.validateresource) helper function.

<details>
<summary>Example: Validate a new profile against all Patient resources in the system</summary>
  <MedplumCodeBlock language="bash" selectBlocks="profileMigration">
    {ExampleCode}
  </MedplumCodeBlock>
</details>

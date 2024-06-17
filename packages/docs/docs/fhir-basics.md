---
id: fhir-basics
toc_max_heading_level: 2
sidebar_position: 2.1
keywords:
  - getting started
  - fhir
  - resource
  - codeableconcept
  - reference
  - identifier
---

# FHIR Basics

import MedicationExample from '!!raw-loader!@site/..//examples/src/medications/medication-codes.ts';
import MedplumCodeBlock from '@site/src/components/MedplumCodeBlock';

[patient]: /docs/api/fhir/resources/patient
[practitioner]: /docs/api/fhir/resources/practitioner
[medicationrequest]: /docs/api/fhir/resources/medicationrequest
[medication]: /docs/api/fhir/resources/medication
[device]: /docs/api/fhir/resources/device
[procedure]: /docs/api/fhir/resources/procedure
[careplan]: /docs/api/fhir/resources/careplan
[encounter]: /docs/api/fhir/resources/encounter
[reference]: /docs/api/fhir/datatypes/reference
[codeableconcept]: /docs/api/fhir/datatypes/codeableconcept

## Why FHIR?

Medplum stores healthcare data using the FHIR standard. Storing data according to this standard provides developers with the following benefits:

- **Interoperability**: Increasingly, healthcare partners are exposing their data via FHIR APIs. Storing your data according to FHIR spec smooths the path to interoperating with multiple partners
- **Future Proofing**: The healthcare ecosystem is complex and fragmented. As they encounter these complexities, many digital health companies end up performing costly data migrations. The FHIR spec anticipates many of the complexities that arise in the healthcare domain, helping teams avoid these backend rewrites.

While FHIR is quite powerful, it can have a bit of a learning curve. The page will go over the basic concepts for understanding FHIR data in Medplum. For more information, you can check out the [official FHIR documentation](http://hl7.org/fhir/).

## Storing Data: Resources

A core data object in FHIR is called a [**Resource**](https://www.hl7.org/fhir/resource.html). You can think of Resources as **objects** in object oriented languages.

The FHIR standard defines over 150 [**Resource Types**](./api/fhir/resources) that model broad range of healthcare-specific concepts. These include **concrete entities** ([`Patient`][patient], [`Medication`][medication], [`Device`][device]) as well as **abstract concepts** ([`Procedure`][procedure], [`CarePlan`][careplan], [`Encounter`][encounter]).

Each field in a resource is called an [**Element**](https://hl7.org/fhir/R4/element.html), each of which can be a **primitive type** (e.g. `string`, `number`, `date`) or a **complex type** (e.g. [`HumanName`](/docs/api/fhir/datatypes/humanname)).

Lastly, all resources have an `id` element, which is a server-assigned identifier that serves as their **primary key**.

<details>
<summary>
Example [`Patient`][patient]
</summary>
The example below shows an example [`Patient`][patient] resource. Here we can see that the [`Patient`][patient] contains multiple elements, including `name`, `telecom`, and `address`.
```javascript
{
  // Resource Type (i.e. "class name")
  "resourceType": "Patient",
  // Unique id for this resource
  "id": "j_chalmers",
  // Patient Name (could have multiple)
  "name": [
    {
      "use": "official",
      "family": "Chalmers",
      "given": ["Peter", "James"]
    },
    {
      "use": "usual",
      "family": "Chalmers",
      "given": ["Jim"]
    }
  ],
  // Phone + email info
  "telecom": [
    {
      "system": "phone",
      "value": "(03) 3410 5613",
      "use": "mobile"
    }
  ],
  // Address (could have multiple)
  "address": [
    {
      "use": "home", // 'home', 'office', etc.
      "line": ["534 Erewhon St"],
      "city": "PleasantVille",
      "district": "Rainbow",
      "state": "Vic",
      "postalCode": "3999",
      // Single string version of address, used for display
      "text": "534 Erewhon St PeasantVille, Rainbow, Vic  3999"
    }
  ]
}
```
</details>

## Linking Data: References

When working with FHIR, clinical data is often split across multiple resources. For example a prescription is related to the receiving patient, and a diagnostic report may consist of multiple observations.

To create a link between objects, we use [`Reference`][reference] elements. A FHIR [`Reference`][reference] is an element that functions like a **foreign key** in traditional relational databases to create 1-to-1 or many-to-many relationships between resources.

[`Reference`][reference] elements have the following structure:

```ts
{
  "reference" : ":resourceType/:id",     // Resource type + unique id of the referenced Resource
  "display" : string,       // Display string for the reference
  "type" : uri,             // Resource type (if using a "logical reference")
  "identifier" : Identifier
}
```

In Medplum, we will typically only use the `reference` and `display` elements.

<details>
<summary>
Example: Linking a [`MedicationRequest`][medicationrequest] to a [`Patient`][patient] and [`Practitioner`][practitioner]
</summary>
The example below shows a resource modeling a prescription (i.e. [`MedicationRequest`][medicationrequest]) with two references: **`subject` (i.e. the patient)** and **`requester` (i.e. the requesting physician)**.

```javascript
{
  "resourceType": "MedicationRequest",
  "id": "medrx002",
  // Reference to the patient for whom medication is being ordered
  "subject": {
    "reference": "Patient/pat1",
    "display": "Donald Duck"
  },
  "dosageInstruction": [
    {
      "text": "Take one tablet daily as directed"
    }
  ],
  // Reference to the requesting physician
  "requester": {
    "reference": "Practitioner/f007",
    "display": "Patrick Pump"
  }
}
```

</details>

## Querying Data: Search

FHIR offers both a [REST API](/docs/search) and [GraphQL API](/docs/graphql) to query, search, sort, and filter resources by specific criteria (see [this blog post](/blog/2023/09/06/graphql-vs-rest) for tradeoffs between REST and GraphQL).

**FHIR resources cannot be searched by arbitrary fields**. Instead, the specification defines specific [search parameters](/docs/search/basic-search#search-parameters) for each resource that can be used for queries.

Refer to the [Medplum search documentation](/docs/search/basic-search) for a more in-depth tutorial on FHIR search.

## Standardizing Data: Codeable Concepts

The healthcare system commonly uses standardized coding systems to describe healthcare share information between organizations about **diagnoses**, **procedures**, **clinical outcomes**, **billing**.

Some of the most commonly used code systems in the U.S. are:

- [ICD-10](https://www.cms.gov/Medicare/Coding/ICD10) - Diagnoses.
- [LOINC](/docs/careplans/loinc) - Clinical measurements and lab results.
- [RXNorm](/docs/medications/medication-codes#rxnorm) or [NDC](/docs/medications/medication-codes#ndc) - [Medication](/docs/medications/medication-codes#ndc).
- [SNOMED](https://www.snomed.org/) - [Workforce administration](/docs/careplans/tasks#task-assignment), clinical findings.

Because there are multiple code systems for many domains, the same _concept_ can be defined in _multiple code systems_. To handle this mapping from concept to system, the FHIR defines the [`CodeableConcept`][codeableconcept] element type.

A [`CodeableConcept`][codeableconcept] consists of two parts:

- A `text` element - describes the concept in plain language
- A `coding` element - an array of `(system, code)` pairs that provide the standard code for the concept within each code system.

FHIR [`CodeableConcepts`][codeableconcept] use the `system` element to identify each code system within the `coding` array. By convention, FHIR uses absolute URLs to enforce that these systems are a globally unique namespace. _However, these URLs do not always point to hosted web sites._

More detailed information about using coded values with FHIR are available in our
[Terminology Services documentation](/docs/terminology).

Refer to [this blog post](/blog/demystifying-fhir-systems) for a longer discussion of `system` strings.

Refer to the [FHIR official documentation](https://hl7.org/fhir/R4/terminologies-systems.html) for a list of `systems` for common healthcare code systems.

<details>
Example: Tylenol
<summary>
Below is an example [`CodeableConcept`][codeableconcept], that defines the medication Tylenol, in both the [RXNorm](/docs/medications/medication-codes#rxnorm) or [NDC](/docs/medications/medication-codes#ndc) systems.

<MedplumCodeBlock language="ts" selectBlocks="tylenol-example">
  {MedicationExample}
</MedplumCodeBlock>
</summary>
</details>

## Naming Data: Identifiers

One issue in healthcare applications is that the same entity can have many different identifiers in different systems. For example, a patient might be identified simultaneously by their:

- Social Security Number (SSN)
- Medical Record Number (MRN)
- Medicare Beneficiary Identifier
- Driver's License Number

FHIR anticipates this complexity by allowing each resource to have multiple identifiers.

Each identifier is defined by a `(system, value)` pair. As with [`CodeableConcepts`][codeableconcept], the `system` acts as namespace for the identifier, and _must be specified as an absolute URL_ to ensure that it is globally unique.

Refer to [this blog post](/blog/demystifying-fhir-systems#identifiers-1) for best practices on using identifier `system` strings.

Using the identifier system allows you to simplify your healthcare applications by consolidating data in a single resource, while allowing different systems to access the data by different ID schemes.

<details>
<summary>
Example: [`Patient`][patient] with two medical record numbers (MRNs)
</summary>
The example `Patient` below has three identifiers: **an SSN and two MRN identifiers** from different hospital systems.

```javascript
{
  // Resource Type (i.e. "class name")
  "resourceType": "Patient",
  // Unique id for this resource
  "id": "j_chalmers",
  // Patient Name (could have multiple)
  "name": [
    {
      "use": "official",
      "family": "Chalmers",
      "given": ["Peter", "James"]
    }
  ],
  "identifier": [
    // Social Security Number ID (US-SSN)
    {
      "system": "http://hl7.org/fhir/sid/us-ssn",
      "value": "011-11-1234"
    },
    // MRN - Hospital 1
    {
      "system": "http://hospital-1.org",
      "value": "MRN-12345678"
    },
    // MRN - Hospital 2
    {
      "system": "http://hospital-2.org",
      "value": "0987AZ6"
    }
  ]
}
```

</details>

## Listening for changes: Subscriptions

**FHIR has a built-in [Subscription](./api/fhir/resources/subscription) resource** that is used to define a push-based subscription to resources in the system, analogous to web-hooks. A `Subscription` has two primary elements:

- **criteria**: This is a string expression that defines _which_ resources to listen to, specified in [FHIRPath](https://hl7.org/fhirpath/) format. This subscription is invoked whenever a resource that matches the criteria is created or updated.
- **channel**: this describes the kind of action that the `Subscription` will take when it sees a matching resource. Currently, the possible values are `rest-hook`, `websocket`, `email`, and `message`.

In Medplum, a powerful feature is to to **use a [Medplum Bot](./bots)** as the endpoint of the `rest-hook` channel. This allows you to run an arbitrary piece of code in response to data changes and automate your medical workflows. See our [Bot-Subscription tutorial](./bots/bot-for-questionnaire-response) for more information.

<br/>

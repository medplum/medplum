---
id: fhir-basics
toc_max_heading_level: 2
sidebar_position: 2.1
---

# FHIR Basics

## Why FHIR?

Medplum stores healthcare data using the FHIR standard. Storing data according to this standard provides developers with the following benefits:

- **Interoperability**: Increasingly, healthcare partners are exposing their data via FHIR APIs. Storing your data according to FHIR spec smooths the path to interoperating with multiple partners
- **Future Proofing**: The healthcare ecosystem is complex and fragmented. As they encounter these complexities, many digital health companies end up performing costly data migrations. The FHIR spec anticipates many of the complexities that arise in the healthcare domain, helping teams avoid these backend rewrites.

While FHIR is quite powerful, it can have a bit of a learning curve. The page will go over the basic concepts for understanding FHIR data in Medplum. For more information, you can check out the [official FHIR documentation](#http://hl7.org/fhir/).

## Resources

A core data object in FHIR is called a [**Resource**](https://www.hl7.org/fhir/resource.html). You can think of Resources as **objects** in object oriented languages. The FHIR standard defines a set of [**Resource Types**](./api/fhir/resources), similar to **classes**, that have been built for healthcare applications.

Resources can represent a broad range of healthcare ideas, from very **concrete healthcare items** (e.g. [Patient](./api/fhir/resources/patient), [Medication](./api/fhir/resources/medication), [Device](./api/fhir/resources/device)) or more **abstract concepts** (e.g. [Procedure](./api/fhir/resources/procedure), [Care Plan](./api/fhir/resources/careplan), [Encounter](./api/fhir/resources/encounter)).

A `Resource` is composed of multiple fields, called `Elements`, each of which can be a **primitive type** (e.g. strings, numbers, dates) or a **complex type** (e.g. JSON objects).

### Example

The example below shows an example **[Patient](./api/fhir/resources/patient) resource**, represented as JSON. Here we can see that the `Patient` contains multiple `Elements`, including: `name`, `telecom`, and `address`.

```javascript
{
  // Resource Type (i.e. "class name")
  "resourceType": "Patient",
  // Unique id for this resource
  "id": "j_chalmers",
  // Paitient Name (could have multiple)
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

<br/>

## References: Linking Resources

Often times, multiple resources contain related data. For example a **prescription is related to the receiving patient**, and a **diagnostic report may consist of multiple observations**.

**To create pointers between objects, we use** `Reference` **elements**. A FHIR `Reference` is not a `Resource`, but a data type for a resource `Element`. The full FHIR `Reference` object has the follow structure:

```ts
{
  "reference" : string,     // Unique id of the referenced Resource
  "display" : string,       // Display string for the reference
  "type" : uri,             // Resource type (if using a "logical reference")
  "identifier" : Identifier
}
```

In Medplum, we will typically only use the `reference` and `display` fields.

### Example

The example below shows a [MedicationRequest](./api/fhir/resources/medicationrequest) resource two references: **`subject` (i.e. the patient)** and **`requester` (i.e. physician)**.

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

<br/>

## Identifiers: Naming Resources

One issue in healthcare applications is that **the same resource can have many different identifiers**, depending on the context. For example, a patient might be identified simulataneously by their:

- Social Security Number (SSN)
- Medical Record Number (MRN)
- Medicare Beneficiary Identifier
- Driver's License Number

FHIR anticipates this complexity by allowing each resource to have multiple identfiers.

**Each identifier is defined by a** `(system, value)` ** pair.** The `system` acts as _namespace_ for the identifier, and _must be specified as an absolute URL_ to ensure that it is globally unique.

**Using the identifier system allows you to simplify your healthcare applications** by consolidating data in a single resource, while allowing different systems to access the data by different ID schemes.

### Example

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

<br/>

## Search Parameters: Querying Resources

There are many cases in which a client would like to query resources by a certain field value. **FHIR resources cannot be searched by arbitrary fields**. Instead, the specification **defines specific search parameters for each resource** that can be used for queries.

You can find the search parameters on the [reference page](./api/fhir/resources) for each resource. **Refer to the [FHIR Search](https://www.hl7.org/fhir/search.html) documentation** for how construct search queries using these parameters.

### Example

For example the [Medication resource](./api/fhir/resources/medication#search-parameters) defines the following search parameters:

- Identifier
- Code
- Expiration Date
- Form
- Ingredient
- Ingredient Code
- Lot Number
- Manufacturer
- Status

<br/>

## Subscriptions: Listening for changes

**FHIR has a built-in [Subscription](./api/fhir/resources/subscription) resource** that is used to define a push-based subscription to resources in the system, analogous to web-hooks. A `Subscription` has two primary elements:

- **criteria**: This is a string expression that defines _which_ resources to listen to, specified in [FHIRPath](https://hl7.org/fhirpath/) format. This subscription is invoked whenever a resource that matches the criteria is created or updated.
- **channel**: this describes the kind of action that the `Subscription` will take when it sees a matching resource. Currently, the possible values are `rest-hook`, `websocket`, `email`, and `message`.

In Medplum, a powerful feature is to to **use a [Medplum Bot](./bots)** as the endpoint of the `rest-hook` channel. This allows you to run an arbitrary piece of code in response to data changes and automate your medical workflows. See our [Bot-Subscription tutorial](./bots/bot-for-questionnaire-response) for more information.

<br/>

## Codeable Concepts: Standarding Data

The healthcare system commonly uses standardized coding systems to describe healthcare concepts such as **diagnoses**, **procedures**, **medical equipment**, and **billing information**. These coding systems are crucial for sharing data between systems because they provide standardized values that organizations know how to process. Some common coding systems include [LOINC](https://loinc.org/), [SNOMED](https://www.snomed.org/), [CPT](https://www.ama-assn.org/amaone/cpt-current-procedural-terminology), [ICD](https://www.cms.gov/Medicare/Coding/ICD10), and [HCPCS](https://www.cms.gov/medicare/coding/medhcpcsgeninfo).

The same concept being defined in mulitple coding systems. To handle this mapping from concept to system, the FHIR standard defines a data structure called a `CodeableConcept`. A `CodeableConcept` contains an array of `(system, code)` pairs, along with a text field to describe the overall concept.

Below is an example `CodeableConcept`, that defines a negative test result outcome in the **SNOMED** and **ACME Lab** systems.

```javascript
{
  // Text description of the concept
  "text": "Negative for Chlamydia Trachomatis rRNA",
  "coding": [
    // Encoding of the value in SNOMED system
    {
      "system": "http://snomed.info/sct",
      "code": "260385009",
      "display": "Negative"
    },
    // Encoding of the value in ACME LAB system
    {
      "system": "https://acme.lab/resultcodes",
      "code": "NEG",
      "display": "Negative"
    }
  ]
}
```

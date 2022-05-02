# FHIR Basics

- Medplum stores data in the FHIR standard
- FHIR has the following advantages
  - Interoperability
  - Future proofing (example: charge items for devices)
- The page will go over the basic concepts for understanding FHIR data. [Link to FHIR docs](#)

## Resources

A core data object in FHIR is called a [**Resource**](https://www.hl7.org/fhir/resource.html). You can think of Resources as **objects** in object oriented languages. The FHIR standard defines a set of [**Resource Types**](/category/resources), similar to **classes**, that have been built for healthcare applications. A `Resource` is composed of multiple fields, called `Elements`, each of which can be a **primitive type** (e.g. strings, numbers, dates) or a **complex type** (e.g. JSON objects)

Resources can represent a broad range of healthcare ideas, from very **concrete healthcare items** (e.g. [Patient](/api/fhir/resources/patient), [Medication](/api/fhir/resources/medication), [Device](/api/fhir/resources/device)) or more **abstract concepts** (e.g. [Procedure](/api/fhir/resources/procedure), [Care Plan](/api/fhir/resources/careplan), [Encounter](/api/fhir/resources/encounter)).

### Example

The example below shows an example **[Patient](/api/fhir/resources/patient) resource**, represented as JSON:

```json
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

## References: Linking Resources

Often times, one resource depends on data stored in another. To create pointers between objects, we use`Reference`s. A FHIR `Reference` is not a `Resource` itself, but a datatype for an `Element`.

The full FHIR `Reference` object has the follow structure:

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

The example below shows a [MedicationRequest](/api/fhir/resources/medicationrequest) resource two references: for the **`subject` (i.e. patient)** and the **`requester` (i.e. physician)**.

```json
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

## Identifiers: Naming Resources

One issue in healthcare applications is that the same resource can have many different **identifiers**, depending on the context. For example, a patient might be identified simulataneously by their:

- Social Security Number (SSN)
- Medical Record Number (MRN)
- Medicare Beneficiary Identifier
- Driver's License Number

FHIR anticipates this complexity by allowing each resource to have multiple identfiers. Using the identifier system allows you to tame the complexity of healthcare applications by consolidating data in a single resource, while allowing different systesms to access the data by different ID schemes.

**Each identifier is defined by a** `(system, value)` ** pair.** The `system` acts as _namespace_ for the identifier, and _must be specified as an absolute URL_ to ensure that it is globally unique.

### Example

- In the example below, we have a patient with both an SSN and two MRN identifiers

```json
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

## Search Parameters: Finding the right data

There are many cases in which a client would like to query resources that fulfill certain criteria. To

- The FHIR specification defines which fields can be used to search a given resource type. These are the resource's _search parameters_
- Check out the the documentation for each Resource Type to understand which parameters can be searched
- <Example/>
- Refer to the FHIR docs for the detailed search syntax

## Subscriptions: Listening for updates

- FHIR has a built-in concept of subscriptions
- A FHIR subscription is a general purpose notion than can used to describe any kind of event handler
- You can use the Medplum App to set up Subscriptions to take the following actions
  - Run a [Bot](#)
  - ...

## Codeable Concepts

The healthcare system commonly uses standardized coding systems to describe healthcare concepts such as **diagnoses**, **procedures**, **medical equipment**, and **billing information**. These coding systems are crucial for sharing data between systems because they provide standardized values that organizations know how to process. Some common coding systems include [LOINC](https://loinc.org/), [SNOWMED](https://www.snomed.org/), [CPT](https://www.ama-assn.org/amaone/cpt-current-procedural-terminology), [ICD](https://www.cms.gov/Medicare/Coding/ICD10), and [HCPCS](https://www.cms.gov/medicare/coding/medhcpcsgeninfo).

The same concept being defined in mulitple coding systems. To handle this mapping from concept to system, the FHIR standard defines a data structure called a `CodeableConcept`. A `CodeableConcept` contrains an array of `(system, code)` pairs, along with a text field to describe the overall concept.

Below is an example `CodeableConcept`, that defines a negative test result outcome in the **SNOWMED** and **ACME Lab** systems.

```json
{
  // Text description of the concept
  "text": "Negative for Chlamydia Trachomatis rRNA",
  "coding": [
    // Encoding of the value in SNOWMED system
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

import {CodeBlock} from '@theme/CodeBlock'

# Defining your Diagnostic Catalog

Administering your laboratories or diagnostic services begins with the crucial task of outlining your catalog of diagnostic services. This encompasses defining your diagnostics tests , panels, specimen collection requirements, and reference ranges for clinical results.

Having a well-defined, structured catalog enables:

- Robust access controls
- Higher quality analytics
- Smoother CLI/CAP certification
- Streamlined billing

This guide will cover the basic framework to defining a building catalog in FHIR. The steps are:

1. Define your tests
2. Define your specimens
3. Define your orderable services
4. Define your laboratory procedures

Our recommendations are informed by the follow the [Order Catalog Implementation Guide](http://hl7.org/fhir/uv/order-catalog/2020Sep/) implementation guide, which has been informed by contributors from Labcorp and Quest Diagnostics.

## Define your tests

The first step in building your catalog is to define the tests results you measure for the patient.

The `Observation` is the primary *operational* resource, and is used to record a clinical measurement for for a specific patient. `ObservationDefinition` is the corresponding *administrative* counterpart, and is used to defines how an `Observation` should be measured, interpreted, a reported.

`Observations`  and `ObservationDefinitions ` are linked by sharing a common `code` element, that should include a [LOINC code](./loinc) in most cases.

The table below highlights the most important fields for creating good `ObservationDefinitions`

| Element                         | Description                                                  | Code System                        | Example                                                      |
| ------------------------------- | ------------------------------------------------------------ | ---------------------------------- | ------------------------------------------------------------ |
| `code`                          | Code representing the observation type.                      | LOINC (see [LOINC codes](./loinc)) | [2339-0](https://loinc.org/2339-0) -Glucose [Mass/volume] in Blood |
| `quantitativeDetails.units`     | Units expressing the observation value.                      | UCUM                               | mg/dL                                                        |
| `quantitativeDetails.precision` | Number of places of precision *to the right of the decimal point* | N/A                                | 2 (e.g. `0.11`)                                              |
| `qualifiedInterval`             | <p>Range of valid or reference values for the observation, to be used during interpretation. </p><p>See our [guide on reference ranges](./reference-ranges) for more info.</p> | N/A                                | TODO                                                         |
| `preferredReportedName`         | Preferred name used for reporting the observation results to the patient. | N/A                                | Glucose Level                                                |

## Define your specimens

In the context of laboratory use cases, it's essential to recognize that observations are based on samples extracted from patients, known as "specimens". 

The `Specimen` resource is the *operational* resource that stores information about the material extracted from a patient. As with `Observations`, `Specimen` has a corresponding *administrative* resource, called `SpecimenDefinition`.

`SpecimenDefinition` describes the type of specimen material to be collected, as well as details about the collection process, storage, handling, and preparation for testing.

A well constructed diagnostic catalog links the specimen requirements for each test to the test definition (`ObservationDefinition`), to provide a data-driven way of aggregating your required specimens for the full diagnostic service. 

The `SpecimenDefinition` allows you to specify a lot of details about your specimen, but the most relevant are:

| Field                  | Description                                         | Code System                                                  | Example                                                      |
| ---------------------- | --------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------ |
| `typeCollected`        | Type of material collected.                         | [SNOMED (children of 123038009 - Specimen)](https://browser.ihtsdotools.org/?perspective=full&conceptId1=123038009&edition=MAIN/2023-07-31&release=&languages=en) | [122554006](https://browser.ihtsdotools.org/?perspective=full&conceptId1=122554006&edition=MAIN/2023-07-31&release=&languages=en) - Capillary Blood Specimen |
| `collection`           | Procedure used for collection.                      | [SNOMED (children of 118292001 - Removal)](https://browser.ihtsdotools.org/?perspective=full&conceptId1=118292001&edition=MAIN/2023-07-31&release=&languages=en) | [278450005](https://browser.ihtsdotools.org/?perspective=full&conceptId1=278450005&edition=MAIN/2023-07-31&release=&languages=en) - Finger-prick sampling |
| `typeTested.container` | Details about the container storing the specimen.   | [Specimen Container Type](https://hl7.org/fhir/R4/valueset-specimen-container-type.html) | Capillary blood collection tube, no-additive                 |
| `typeTested.handling`  | Duration of storage at different temperature ranges | [Handling Condition](https://hl7.org/fhir/R4/valueset-handling-condition.html) | Store refrigerated at 2-8°C for up to 48 hours               |



:::tip `typeCollected` vs `typeTested`



Difference between type tested and typeCollected - material that is collected from a patient may be split up, prepared, and handled different ways. The typeTested elements describe *all* the *outputs* of the collection process, and contains a lot more information about the containment vessel, rejection criteria, and temperature restrictions for *each* output.

:::

TODO: Example

## Define your services

The next step is to roll up your individual tests and procedures into orderable services that your patients can order. These can be thought of as your diagnostic "product offerings."

These products are represented as `PlanDefinition` resources. The `PlanDefinition` is primarily a grouping that references the `ActivityDefinitions` you will create in the next section.

Important fields: 

| Field                        | Description                                                  | Code System                                                  | Example                                                 |
| ---------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------ | ------------------------------------------------------- |
| `name`                       | The computer-friendly name of the service.                   |                                                              | mens-health-panel                                       |
| `title`                      | The human-friendly name of the service.                      |                                                              | Men's Health Panel                                      |
| `identifier`                 | Business identifier for the service (i.e. product or SKU code) |                                                              | dx-panel-12345                                          |
| `type`                       | Whether the service is a single test or a panel              | [Laboratory service types](http://hl7.org/fhir/uv/order-catalog/2020Sep/ValueSet-laboratory-service-type.html) | panel                                                   |
| `useContext`                 | How this `PlanDefinition`                                    |                                                              | Lab Order Entry (see example below)                     |
| `action.code`                | The code for lab procedure corresponding                     | [LOINC](./loinc)                                             | Administer medication                                   |
| `action.definitionCanonical` | The "canonical url" of the the `ActivityDefinition` representing the procedure (see below) |                                                              | http://example.org/ActivityDefinition/electrolyte-panel |



## Define your lab procedures

The last step is to carve up your services into lab procedures. 

While the services defined by the PlanDefinition defines the *patient-facing* groups of tests, lab procedures refer to the *operational* breakdown of your tests. 

### The Simple Case

Each entry in  `PlanDefinition.action` references an individual lab procedure, with `PlanDefinition.action.definitionCanonical` referencing an `ActivityDefintion` resource for details. 

Most cases are simple, and you only need a single `PlanDefinition.action` and `ActivityDefinition`, representing the main operational procedure performed to carry this laboratory service.

TODO: Example



### Reusing Procedures

However, in some cases, a product offering might *embed* multiple procedures that are reused across service offerings. In these cases, we can define multiple entries in `PlanDefinition.action`, each with their own `ActivityDefinition`. 

This allows you to unify the definition of your procedures, while providing them a 

TODO: Diagram

TODO: Example



:::tip Sub actions

Beyond flat lists of procedures, FHIR `PlanDefinitions` can be used to represent sub-procedures, mutually exclusive groups of procedures, reflex tests, and other complicated arrangements. 

These advanced scenarios are out of scope for this guide, but you can check out the [this implementation guide](http://hl7.org/fhir/uv/order-catalog/2020Sep/exlabservices.html) for examples of how these might be implemented

::: 

There is a bit of an art to determining how to group your tests into procedures, and it requires an understanding of your lab operations. Some considerations:

* Are there reusable groups of tests that are *always* performed together?
* Do these groups have their own [LOINC](./loinc) codes?
* Do your analyzers have a single entry input to order this test?

### ActivityDefinitions

The `ActivityDefinition` resource stores detailed information about each procedure, and is the resource that links `PlanDefinition.action`, to the `ObservationDefintions` and `SpecimenDefinitions` we defined earlier. 

The most important fields for `ActivityDefinition` are summarized below: 

| Element                        | Description                                                  | Code System      | Example                                                      |
| ------------------------------ | ------------------------------------------------------------ | ---------------- | ------------------------------------------------------------ |
| `code`                         | The LOINC code corresponding to this procedure. Should match the code used in `PlanDefinition.action` | [LOINC](./loinc) | Glucose [Mass/volume] in Blood ([2339-0](https://loinc.org/2339-0)) |
| `url`                          | <p>Known as the "canonical URL" for the resource. This should be a fully qualified, globally unique URL. </p><p>FHIR recommends for many administrative resources (aka "definitional resources") to have canonical URLs to provide a globally unique business identifier. Read more about canonical URLs [here](https://hl7.org/fhir/resource.html#canonical)</p><p>A recommended pattern for constructing this URL is:<br /> `http://[your-company-url]/ActivityDefinition/[test-name]`</p> |                  | http://example.org/ActivityDefinition/electrolyte-panel      |
| `observationResultRequirement` | References to the `ObservationDefinition` resources for the test results produced by this procedure (see above). | See above        |                                                              |
| `specimenDefinition`           | References to the `SpecimenDefinition` resources for the test results produced by this procedure (see above). | See above        |                                                              |
| `name`                         | A computer-friendly name for the procedure                   |                  | glucose                                                      |
| `title`                        | A human-friendly name for the procedure                      |                  | Glucose in Blood                                             |
| `kind`                         | The kind of resource that will represent the lab order. For diagnostics, this is always `ServiceRequest`. |                  | ServiceRequest                                               |

<details><summary>Example</summary>

```ts

```

</details>



## Querying your catalog

You can query a `PlanDefinition`, and the associated `ActivityDefinitions` with this query:

You can 

## Example: Electrolyte Panel

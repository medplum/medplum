import {CodeBlock} from '@theme/CodeBlock'

# Defining your Diagnostic Catalog

Administering your laboratories or diagnostic services begins with the crucial task of outlining your catalog of diagnostic services. This encompasses defining your diagnostics tests , panels, specimen collection requirements, and reference ranges for clinical results.

Having a well-defined, structured catalog enables:

- Robust access controls
- Higher quality analytics
- Smoother CLI/CAP certification
- Streamlined billing

This guide will cover the basic framework to defining a building catalog in FHIR, which involves:

1. Defining your tests (these are your lab procedures).
2. Defining your Observations results
3. Defining your Specimen requirements
4. Grouping your tests into panels

Our recommendations are informed by the follow the [Order Catalog Implementation Guide](http://hl7.org/fhir/uv/order-catalog/2020Sep/) implementation guide, which has been informed by contributors from Labcorp and Quest Diagnostics.



## Define your tests

The first step is to define the laboratory procedures (aka tests) that you offer to patients. These are modeled by the `ActivityDefinition` resource.

While `ActivityDefinition` has a lot of fields, only a few are relevant for defining your lab test:

| Element                        | Description                                                  | Example                                                      |
| ------------------------------ | ------------------------------------------------------------ | ------------------------------------------------------------ |
| `code`                         | The LOINC code corresponding to this lab test. See [our guide on LOINC codes](/docs/careplans/loinc) for more details. | Glucose [Mass/volume] in Blood ([2339-0](https://loinc.org/2339-0)) |
| `url`                          | <p>Known as the "canonical URL" for the resource. This should be a fully qualified, globally unique URL. </p><p>FHIR recommends for many administrative resources (aka "definitional resources") to have canonical URLs to provide a globally unique business identifier. Read more about canonical URLs [here](https://hl7.org/fhir/resource.html#canonical)</p><p>A recommended pattern for constructing this URL is:<br /> `http://[your-company-url]/ActivityDefinition/[test-name]`</p> | http://example.org/ActivityDefinition/glucose                |
| `observationResultRequirement` | <p>Details about `Observation(s)` produced by this test. </p><p>See the [next section](#) for details</p> | See Below                                                    |
| `specimenDefinition`           | <p>Details about the input `Specimen` required to perform this test </p><p>See [below](#) for details</p> | See Below                                                    |
| `name`                         | A computer-friendly name for the test                        | glucose                                                      |
| `title`                        | A human-friendly name for the test                           | Glucose in Blood                                             |
| `kind`                         | The kind of resource that will represent the lab order. For diagnostics, this is always `ServiceRequest`. | ServiceRequest                                               |



<details><summary>Example</summary>

```ts
```

</details>



### Define Observation Outputs

The results of a diagnostic test are represented in FHIR as an `Observation` resource. 

`Observations` are used to measure clinical values for a patient

can be quantitative (e.g. blood pressure, weight) or qualitative (e.g. smoking status)

`Observation` is an operational resource - it is generated while treating patients

There is a corresponding administrative resource called `ObservationDefinition`.

The most important use of the `ObservationDefinition` is to define important ranges for `ObservationResults`

These are linked to `Observations` using the `ObservationDefinition.code` element

LOINC is the preferred code system for `Observations` and `ObservationDefinitions`

This guide will talk about how to author `ObservationDefinitions` so that your implementation has a nice, data-driven way of specifying your allowable ranges

For numeric Observations, the `ObservationDefinition.qualifiedInterval` is the key field



The `ObservationDefinition` resource defines metadata about each expected `Observation` type, that will including: 

* Expected units
* Reference Ranges (normal, critical, absolute)
* Preferred reporting name

These `ObservationDefinition` are then linked to specific tests using the `ActivityDefinition.observationResultRequirement`





<details><summary>Example</summary>


```ts

```

</details>



Most diagnostic tests (`ActivityDefinitions`) will have a single `ObservationDefinition` associated with them. 

However, in some cases, a single lab procedure can produce multiple results at once. 

A common example is the Electrolytes Panel. 

Most tests will have a single 

Assign loinc code code 



### Define Specimen Requirements

Use SpecimenDefinition

Important fields:

* Type collected
* Type tested

Other fields

* Container

  

Example

### (Optional) Define Observation Inputs





### Example

Example SpecimenDefinition

Example ObservationDefinition

Example ActivityDefintiion, with references





## Define your panels





:::tip Panels and Sub-Panels

::: 







## Querying your catalog



## Example: Basic Metabolic Panel


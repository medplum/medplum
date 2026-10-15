---
id: advanced-search-parameters
title: Advanced Search Parameters
weight: 30
---

The FHIR search framework allows for special search parameters that enable more complex searches to fine-tune your results. In this document, we will go over the following special parameters:

- [\_id](#_id)
- [\_lastUpdated](#_lastupdated)
- [\_summary](#_summary)
- [\_elements](#_elements)
- [\_tag](#_tag)
- [\_compartment](#_compartment)
- [\_total](#_total)
- [\_profile](#_profile)
- [\_security](#_security)
- [\_source](#_source)
- [\_filter](#_filter)
- [\_sort](#_sort)
- [\_deleted](#_deleted)
- [\_project](#_project)
- [\_type](#_type)
- [\_cursor](#_cursor)

## \_id

The `_id` parameter allows you to search for any resource based on its `id` element. It is also the only way to search using multiple ids in FHIR. To do so, just enter the ids as a comma separated list.

<details>
  <summary>Example: Searching for patients by _id</summary>
  {{< tabs groupId="language" >}}
    {{< tab value="ts" label="Typescript" >}}
{{< code-example file="packages/examples/src/search/advanced-search-parameters.ts" language="ts" blocks="idTs" >}}
    {{< /tab >}}
    {{< tab value="cli" label="CLI" >}}
{{< code-example file="packages/examples/src/search/advanced-search-parameters.ts" language="bash" blocks="idCli" >}}
    {{< /tab >}}
    {{< tab value="curl" label="cURL" >}}
{{< code-example file="packages/examples/src/search/advanced-search-parameters.ts" language="bash" blocks="idCurl" >}}
    {{< /tab >}}
  {{< /tabs >}}
</details>

## \_lastUpdated

The `_lastUpdated` parameter allows you to search for resources based on when they were most recently changed.

This is especially useful when combined with [comparison operators](/docs/search/basic-search#searching-by-comparison), such as `gt` (greater than) or `lt` (less than) to find resources that have or have not been changed since a certain time or date.

<details>
  <summary>Example: Searching for only communications that have occurred since the beginning of October, 2023</summary>
  {{< tabs groupId="language" >}}
    {{< tab value="ts" label="Typescript" >}}
{{< code-example file="packages/examples/src/search/advanced-search-parameters.ts" language="ts" blocks="lastUpdatedTs" >}}
    {{< /tab >}}
    {{< tab value="cli" label="CLI" >}}
{{< code-example file="packages/examples/src/search/advanced-search-parameters.ts" language="bash" blocks="lastUpdatedCli" >}}
    {{< /tab >}}
    {{< tab value="curl" label="cURL" >}}
{{< code-example file="packages/examples/src/search/advanced-search-parameters.ts" language="bash" blocks="lastUpdatedCurl" >}}
    {{< /tab >}}
  {{< /tabs >}}
</details>

## \_summary

The `_summary` parameter allows you to return only a portion of a resource's elements. Its primary intent is to optimize your queries by fetching only essential information. It is particularly useful when searching for large resources such as those with images or repeating elements.

The `_summary` parameter can contain one of the following value set:

| Value   | Description                                                                                         |
| ------- | --------------------------------------------------------------------------------------------------- |
| `true`  | Only returns elements that are marked as `summary` in the resource definition.                      |
| `count` | Returns the count of matching resources, but none of the actual resource details for those matches. |

<details>
  <summary>Example: Searching for a summary of a patient</summary>
  {{< tabs groupId="language" >}}
    {{< tab value="ts" label="Typescript" >}}
{{< code-example file="packages/examples/src/search/advanced-search-parameters.ts" language="ts" blocks="summaryTs" >}}
    {{< /tab >}}
    {{< tab value="cli" label="CLI" >}}
{{< code-example file="packages/examples/src/search/advanced-search-parameters.ts" language="bash" blocks="summaryCli" >}}
    {{< /tab >}}
    {{< tab value="curl" label="cURL" >}}
{{< code-example file="packages/examples/src/search/advanced-search-parameters.ts" language="bash" blocks="summaryCurl" >}}
    {{< /tab >}}
  {{< /tabs >}}
</details>

## \_elements

The `_elements` parameter is similar to `_summary` in that it allows you to return only a subset of the resource's elements. However, rather than a predefined value set, `_elements` allows you to choose which fields you would like to return.

The fields you choose should be formatted as a comma separated list of base elements for a given resource.

Note that any top-level mandatory or modifier elements should always be included in the chosen list of elements.

<details>
  <summary>Example: Searching the subject and performers of observations</summary>
  {{< tabs groupId="language" >}}
    {{< tab value="ts" label="Typescript" >}}
{{< code-example file="packages/examples/src/search/advanced-search-parameters.ts" language="ts" blocks="elementsTs" >}}
    {{< /tab >}}
    {{< tab value="cli" label="CLI" >}}
{{< code-example file="packages/examples/src/search/advanced-search-parameters.ts" language="bash" blocks="elementsCli" >}}
    {{< /tab >}}
    {{< tab value="curl" label="cURL" >}}
{{< code-example file="packages/examples/src/search/advanced-search-parameters.ts" language="bash" blocks="elementsCurl" >}}
    {{< /tab >}}
  {{< /tabs >}}
</details>

## \_tag

The `_tag` parameter allows you to search on the `tag` field of the `meta` element of the resource you are searching for. The `tag` field contains user-defined tags to categorize the resource.

<details>
  <summary>Example: Searching for observations that are tagged as critical</summary>
  {{< tabs groupId="language" >}}
    {{< tab value="ts" label="Typescript" >}}
{{< code-example file="packages/examples/src/search/advanced-search-parameters.ts" language="ts" blocks="tagTs" >}}
    {{< /tab >}}
    {{< tab value="cli" label="CLI" >}}
{{< code-example file="packages/examples/src/search/advanced-search-parameters.ts" language="bash" blocks="tagCli" >}}
    {{< /tab >}}
    {{< tab value="curl" label="cURL" >}}
{{< code-example file="packages/examples/src/search/advanced-search-parameters.ts" language="bash" blocks="tagCurl" >}}
    {{< /tab >}}
  {{< /tabs >}}
</details>

## \_compartment

A compartment is a grouping of resources which share a common relation. For example, each `Patient` resource has its own compartment. A `Patient` compartment includes any resources which reference that `Patient`, usually in the `subject` field.

Medplum allows you to easily search using compartments by providing the non-standard `_compartment` parameter. This enables you to find all resources of a given type that are associated with a certain compartment.

<details>
  <summary>Example: Find all communications for a patient</summary>
  {{< tabs groupId="language" >}}
    {{< tab value="ts" label="Typescript" >}}
{{< code-example file="packages/examples/src/search/advanced-search-parameters.ts" language="ts" blocks="compartmentTs" >}}
    {{< /tab >}}
    {{< tab value="cli" label="CLI" >}}
{{< code-example file="packages/examples/src/search/advanced-search-parameters.ts" language="bash" blocks="compartmentCli" >}}
    {{< /tab >}}
    {{< tab value="curl" label="cURL" >}}
{{< code-example file="packages/examples/src/search/advanced-search-parameters.ts" language="bash" blocks="compartmentCurl" >}}
    {{< /tab >}}
  {{< /tabs >}}
</details>

## \_total

The `_total` parameter allows you to return the total count of matching resources in your search response. For more details see the [Paginated Search docs.](/docs/search/paginated-search#getting-the-total-number-of-results-with-_total)

{{< warning title="`_total=accurate` limitation" >}}

The `_total=accurate` search parameter will only attempt to return the accurate count if the estimated total is under 1 million.

{{< /warning >}}

<details>
  <summary>Example: Search for all patients in your organization and get an estimate of the total number</summary>
  {{< tabs groupId="language" >}}
    {{< tab value="ts" label="Typescript" >}}
{{< code-example file="packages/examples/src/search/advanced-search-parameters.ts" language="ts" blocks="totalTs" >}}
    {{< /tab >}}
    {{< tab value="cli" label="CLI" >}}
{{< code-example file="packages/examples/src/search/advanced-search-parameters.ts" language="bash" blocks="totalCli" >}}
    {{< /tab >}}
    {{< tab value="curl" label="cURL" >}}
{{< code-example file="packages/examples/src/search/advanced-search-parameters.ts" language="bash" blocks="totalCurl" >}}
    {{< /tab >}}
  {{< /tabs >}}
</details>

## \_profile

FHIR allows [profiling](http://hl7.org/fhir/R4/profiling.html) to create custom data structures that specify how resources can be sub-specialized to meet specific use cases. The `_profile` parameter allows you to search based on these profiles.

The `_profile` parameter is a reference parameter, meaning you may provide a reference as an argument to the parameter. See the [FHIR Profiles doc](/docs/fhir-datastore/profiles) to learn more about profiling.

<details>
  <summary>Example: Search for observations that are part of the pediatric growth charts profile</summary>
  {{< tabs groupId="language" >}}
    {{< tab value="ts" label="Typescript" >}}
{{< code-example file="packages/examples/src/search/advanced-search-parameters.ts" language="ts" blocks="profileTs" >}}
    {{< /tab >}}
    {{< tab value="cli" label="CLI" >}}
{{< code-example file="packages/examples/src/search/advanced-search-parameters.ts" language="bash" blocks="profileCli" >}}
    {{< /tab >}}
    {{< tab value="curl" label="cURL" >}}
{{< code-example file="packages/examples/src/search/advanced-search-parameters.ts" language="bash" blocks="profileCurl" >}}
    {{< /tab >}}
  {{< /tabs >}}
</details>

## \_security

The `_security` parameter allows you to search on the `security` field of the `meta` element of the resource you are searching for.

The [Confidentiality Level Code System](http://terminology.hl7.org/CodeSystem/v3-Confidentiality) is a standard code system for confidentiality levels.

<details>
  <summary>Example: Searching for patients that are of a **normal** confidentiality level.</summary>
  {{< tabs groupId="language" >}}
    {{< tab value="ts" label="Typescript" >}}
{{< code-example file="packages/examples/src/search/advanced-search-parameters.ts" language="ts" blocks="securityTs" >}}
    {{< /tab >}}
    {{< tab value="cli" label="CLI" >}}
{{< code-example file="packages/examples/src/search/advanced-search-parameters.ts" language="bash" blocks="securityCli" >}}
    {{< /tab >}}
    {{< tab value="curl" label="cURL" >}}
{{< code-example file="packages/examples/src/search/advanced-search-parameters.ts" language="bash" blocks="securityCurl" >}}
    {{< /tab >}}
  {{< /tabs >}}
</details>

## \_source

The `_source` parameter allows you to search on the `source` field of the `meta` element of the resource you are searching for.

The `meta.source` field indicates the system or application that originally created or supplied the resource, which can be useful for filtering or tracking resources based on their origin.

<details>
  <summary>Example: Searching for Patients sourced from `https://foomedical.com`</summary>
  {{< tabs groupId="language" >}}
    {{< tab value="ts" label="Typescript" >}}
{{< code-example file="packages/examples/src/search/advanced-search-parameters.ts" language="ts" blocks="sourceTs" >}}
    {{< /tab >}}
    {{< tab value="cli" label="CLI" >}}
{{< code-example file="packages/examples/src/search/advanced-search-parameters.ts" language="bash" blocks="sourceCli" >}}
    {{< /tab >}}
    {{< tab value="curl" label="cURL" >}}
{{< code-example file="packages/examples/src/search/advanced-search-parameters.ts" language="bash" blocks="sourceCurl" >}}
    {{< /tab >}}
  {{< /tabs >}}
</details>

## \_filter

The `_filter` parameter can be used to filter for more complex queries. For more details see the [\_filter Search Parameter docs](/docs/search/filter-search-parameter).

## \_sort

The `_sort` parameter allows you to sort the results of your search based on different parameters. For details on how to use the `_sort` parameter, see the [Sorting the Results docs](/docs/search/basic-search#sorting-the-results).

## \_deleted

The `_deleted` parameter allows you to search for resources that have been soft-deleted. By default, Medplum filters out deleted resources.

{{< warning title="Mixing `_deleted` with other parameters" >}}

Mixing `_deleted` with most other search parameters will not work as expected. This is because the database columns backing other search parameters are not populated for deleted resources.

{{< /warning >}}

<details>
  <summary>Example: Searching for deleted patients</summary>
  {{< tabs groupId="language" >}}
    {{< tab value="ts" label="Typescript" >}}
{{< code-example file="packages/examples/src/search/advanced-search-parameters.ts" language="ts" blocks="deletedTs" >}}
    {{< /tab >}}
    {{< tab value="cli" label="CLI" >}}
{{< code-example file="packages/examples/src/search/advanced-search-parameters.ts" language="bash" blocks="deletedCli" >}}
    {{< /tab >}}
    {{< tab value="curl" label="cURL" >}}
{{< code-example file="packages/examples/src/search/advanced-search-parameters.ts" language="bash" blocks="deletedCurl" >}}
    {{< /tab >}}
  {{< /tabs >}}
</details>

## \_project

The `_project` parameter allows you to filter resources by their project ID. This is useful when logged in as [Super Admin](/docs/self-hosting/super-admin-guide) or working with linked projects to ensure data isolation.

<details>
  <summary>Example: Searching for patients in a specific project</summary>
  {{< tabs groupId="language" >}}
    {{< tab value="ts" label="Typescript" >}}
{{< code-example file="packages/examples/src/search/advanced-search-parameters.ts" language="ts" blocks="projectTs" >}}
    {{< /tab >}}
    {{< tab value="cli" label="CLI" >}}
{{< code-example file="packages/examples/src/search/advanced-search-parameters.ts" language="bash" blocks="projectCli" >}}
    {{< /tab >}}
    {{< tab value="curl" label="cURL" >}}
{{< code-example file="packages/examples/src/search/advanced-search-parameters.ts" language="bash" blocks="projectCurl" >}}
    {{< /tab >}}
  {{< /tabs >}}
</details>

## \_type

The `_type` parameter allows you to restrict the search to specific resource types. This is particularly useful when performing a system-wide search or when searching across multiple resource types.

<details>
  <summary>Example: Searching for Patients and Observations</summary>
  {{< tabs groupId="language" >}}
    {{< tab value="ts" label="Typescript" >}}
{{< code-example file="packages/examples/src/search/advanced-search-parameters.ts" language="ts" blocks="typeTs" >}}
    {{< /tab >}}
    {{< tab value="cli" label="CLI" >}}
{{< code-example file="packages/examples/src/search/advanced-search-parameters.ts" language="bash" blocks="typeCli" >}}
    {{< /tab >}}
    {{< tab value="curl" label="cURL" >}}
{{< code-example file="packages/examples/src/search/advanced-search-parameters.ts" language="bash" blocks="typeCurl" >}}
    {{< /tab >}}
  {{< /tabs >}}
</details>

## \_cursor

The `_cursor` parameter is used for [cursor-based pagination](/docs/search/paginated-search#cursor-based-pagination). It is generally not constructed manually but is returned in the `link` section of a bundle response for the next page of results. Using `_cursor` is more efficient than `_offset` for deep pagination.

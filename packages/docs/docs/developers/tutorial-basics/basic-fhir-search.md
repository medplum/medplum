---
sidebar_position: 4
---

# Basic Search in FHIR on Medplum

This is an introductory post to searching in FHIR on Medplum. It will introduce the basic concepts and provide some sample code on how to execute basic searches. We won't cover all the FHIR search scenarios, for in depth reference material on FHIR search, [this document](https://www.hl7.org/fhir/search.html) is a good place to start.

There are two high level concepts that is is useful to understand when learning about Search in FHIR:

- FHIR Objects - for example [Patient](https://www.hl7.org/fhir/patient.html)
- Search Parameters - these are searchable fields on a given FHIR object

Using these two basic concepts, let's walk through an example where you want to query all the Patient objects for those who have a name like "Alex".

In the example below `Patient` is the FHIR object and `name` is the search parameter. As the `Patient` class has many fields, so specifying which fields you want to query in the API, in the example you can see this as `_fields`.

To execute this search as via API, here's how you would do it using curl. In this example, you are limiting it the results to 20.

```curl
curl 'https://api.medplum.com/fhir/R4/Patient?_count=20&_fields=id,_lastUpdated,name,birthDate,gender&_sort=-_lastUpdated&name=Alex' \
  -H 'authorization: Bearer $ACCESS_TOKEN'
```

## Use Medplum App to Learn Advanced Search

Learning all of the FHIR objects and search parameters can be intimidating, but you can use Medplum as a tool to learn how to construct searches.

[![FHIR Search Tutorial Video](https://img.youtube.com/vi/0aneLa_S-PY/0.jpg)](https://www.youtube.com/watch?v=0aneLa_S-PY)

Medplum has advanced Search built in, which we will use here to illustrate. The tool allows you to view all the searchable fields. To use this example effectively, you need to be using [Google Chrome](https://www.google.com/chrome/).

- To get started navigate to a page that shows all of the FHIR objects of a certain type, for example the [Patient](https://app.medplum.com/Patient) page.
- Add fields by clicking on the `Fields` button on the top nav, it will show you all the searchable fields for this object. Add whichever ones you like to view them in the tool.
- Add filters by clicking on the `Filters` button on the top nav, it will allow you to filter results, for example search for patients with a name like 'Alex'.
- Once you have set up your fields and filters, open the Developer Tools in chrome, open the Network tab and refresh. You will be able to copy the search request as curl [instructions](https://everything.curl.dev/usingcurl/copyas).
- Of note: make sure to copy the requests of type `fetch`, requests marked type `preflight` are permissions checks and will not return data.

Using this technique, hopefully that will make it straightforward to learn and construct FHIR searches.

## Searching Linked Objects

FHIR also allows you to search across objects, a common use case. For example, if you want to find all of the `DiagnosticReports` that belong to a particular `Patient` you'll need to search across both objects.

FHIR supports this by allowing you to pass in FHIR objects as Search parameters.

Here's an example that requests all DiagnosticReports for a given Patient are referenced by their `id`

```curl
curl 'https://api.medplum.com/fhir/R4/DiagnosticReport?_count=100&subject=Patient/017d49f2-955a-1620-bc31-f96b72f5770e' \
  -H 'authorization: Bearer $ACCESS_TOKEN'
```

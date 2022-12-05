---
sidebar_position: 0
---

# Charting

Building out a charting experience requires composing multiple FHIR resources into an experience that meets the requirements of practitioners. There are three primary interactions that developers should consider when building out a custom charting experience:

- **Summarizing patient history** and status
- Allowing **capture of notes**
- **Placing orders** for medications, labs, imaging, etc.

## Summarizing Patient History

When summarizing patient history, gathering demographic data from the [Patient](/docs/api/fhir/resources/patient.mdx) resource is a basic first step. You can also query all resources related to a given patient from the `/Patient/$everything` endpoint.

Depending on your use case, `$everything` may be verbose to summarize in a chart, so queries for specific resources like active [CarePlans](/docs/api/fhir/resources/careplan.mdx), [MedicationRequests](/docs/api/fhir/resources/medicationrequest.mdx), [Conditions](/docs/api/fhir/resources/condition.mdx) may be more appropriate. [Search](/docs/search/) is useful to construct the specific queries that will give the context needed for a chart.

React components are available to aid in building a quick charting experience. [PatientTimeline](https://storybook.medplum.com/?path=/docs/medplum-patienttimeline--patient), [Timeline](https://storybook.medplum.com/?path=/docs/medplum-timeline--basic), [Search control](https://storybook.medplum.com/?path=/docs/medplum-searchcontrol--checkboxes), [ResourceAvatar](https://storybook.medplum.com/?path=/docs/medplum-resourceavatar--image), [FhirPathDisplay](https://storybook.medplum.com/?path=/docs/medplum-fhirpathdisplay--id) and Tabs are potential components that can speed development of the summarized history.

## Capturing Notes

A wide variety of notes experiences are possible, and customizability is one of the key reasons to use a headless system. From a technical perspective, after a practitioner/patient interaction is complete, a set of appropriate FHIR resources should be created.

Some implementations have a simple text box and allow the practitioner to enter text free form, then construct [Encounter](/docs/api/fhir/resources/encounter.mdx) and/or [ClinicalImpression](/docs/api/fhir/resources/clinicalimpression.mdx) resources.

Some implementations have a library of [Questionnaires](/docs/questionnaires/) that practitioners fill out and use [Bots](/docs/bots/) to drive workflow and create resources in a specific way.

## Placing Orders

Placing orders requires constructing the right resources, for example [CarePlans](/docs/api/fhir/resources/careplan.mdx) and [MedicationRequests](/docs/api/fhir/resources/medicationrequest.mdx) or others. Similar to notes, ordering workflows can be done by creating resources directly, or using [Questionnaires](/docs/questionnaires/) that practitioners fill out and use [Bots](/docs/bots/) to drive workflow and integrations.

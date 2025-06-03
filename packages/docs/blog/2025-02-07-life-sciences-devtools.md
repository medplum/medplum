---
slug: life-sciences-devtools
title: Devtools for Life Sciences
authors: reshma
tags: [lifesciences]
---

On January 15, 2025 Medplum & Flexpa held a [JPMorgan companion event](https://lu.ma/bonej6ih) for the community.  During the event, there were demos of many different open source tools that aid in development for life science workflows.

<!-- truncate -->

The **biopharmaceutical product lifecycle is full of repetitive workflows**, many of which are supported by custom software.  Open source is a natural solution for these workflows, and we have prepared this **list of resources and demo videos** showcased at the event for reference.

## Resource List

![Biopharmaceutical product lifecycle](/img/blog/biopharmaceutical-product-lifecycle.png)

| Workflow | Tool | Stage | Description |
|---------|------|-------|-------------|
| Consents | [Flexpa](https://flexpa.com/) | Pre-clinical & Clinical Development | Allow patients to consent to retrieving records from their insurance carrier |
| Screening | [FHIR questionnaire COA](http://hl7.org/fhir/questionnaire.html) | Pre-clinical & Clinical & Commercial | Use FHIR questionnaires in an EHR or clinical tool |
| Records gathering | [EPIC patient access API](https://fhir.epic.com/) | Preclinical & Clinical development | Allow patients to sync their records from EHR |
| Validation | [NIH FHIR Library](https://lhcforms.nlm.nih.gov/fhir) | Pre-clinical & clinical | Get publicly available LOINCed assessments such as the PHQ-9 and others as FHIR from NIH |
| Consents | [FHIR Consent Model](http://hl7.org/fhir/consent.html) | Pre-clinical Clinical and Commercial | Store and manage consents in FHIR |
| Records gathering | [FHIR to OMOP](https://build.fhir.org/ig/HL7/fhir-omop-ig/) | Preclinical | The FHIR to OMOP Implementation Guide helps map FHIR resources to OMOP data model, used by several academic medical institutions |
| Records Gathering | [US Core Patient Intake](https://github.com/medplum/medplum/tree/main/examples/medplum-patient-intake-demo) | Clinical Development | Capture data in accordance with US Core |

## Demos

### Gathering Standards Compliant Data

Gathering US Core compliant FHIR data, as well as data tagged with [common ontologies](/docs/terminology) such as LOINC, SNOMED, RxNorm and MedDRA is useful study data capture.  In this [this intake demo](https://github.com/medplum/medplum/tree/main/examples/medplum-patient-intake-demo) a Google Forms for FHIR-like workflow is used to generate those high fidelity datasets.

<div className="responsive-iframe-wrapper">
  <iframe src="https://www.youtube.com/embed/W1zvBiLZIOM?start=0" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
</div>

### Read Patient Consented Data from EPIC

EPIC supports gathering patient data with the patient's consent.  Here is a video demonstration of reading from the datastore.

<div className="responsive-iframe-wrapper">
  <iframe src="https://www.youtube.com/embed/r35OyzcpIaY?start=0" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
</div>

### NIH Forms Library

The NIH provides a free forms library, these are tagged with standard ontologies.  This video shows how to use it, and refers to the [questionnaire tutorial](/docs/questionnaires/basic-tutorial).

<div className="responsive-iframe-wrapper">
  <iframe src="https://www.youtube.com/embed/E5gttZwr2mk?start=0" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
</div>


This demo shows embedded FHIR questionnaires in a patient-facing application, enabling standard data capture.  The sample application shown here is [Foomedical](https://foomedical.com/), the source code for which can be found [on Github](https://github.com/medplum/medplum/tree/main/examples/foomedical).

<div className="responsive-iframe-wrapper">
  <iframe src="https://www.youtube.com/embed/umrn4X8QJsY?start=0" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
</div>

### Flexpa: Consents and Claims Data Access

This Flexpa demo shows the process of adding Flexpa data to your application.

<div className="responsive-iframe-wrapper">
  <iframe src="https://www.youtube.com/embed/3Kb1UP510KQ?start=0" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
</div>


This demo shows the Medplum/Flexpa integration to load consented patient data into the datastore for use in research or other workflows.

<div className="responsive-iframe-wrapper">
  <iframe src="https://www.youtube.com/embed/7yZzEneJsAA?start=0" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
</div>




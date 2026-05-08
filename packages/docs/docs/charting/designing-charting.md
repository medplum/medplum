---
sidebar_position: 1
title: Designing Charting
keywords:
  - charting
  - visit templates
  - discovery
  - EMR
tags:
  - charting
---

# Designing Charting

Charting is one of the most important features of an EMR – and one of the hardest to get right. Clinicians have strong opinions shaped by training, specialty, and years in other systems. The surface experience varies enormously: dense structured forms in some products, narrative-first layouts in others. Underneath all of it, the record still has to support safe care and downstream data use.

In Medplum, charting covers the patient summary, encounter documentation, orders, and signing. Medplum is headless: you choose screens, flows, and affordances. The sections below cover the key architecture decisions.

## Why Structure Pays Off with FHIR

Every implementation balances structured capture (picklists, measurements, questionnaires) with free narrative (assessment paragraphs, context that does not fit a widget). Leaning structured where the workflow allows is how you get the most from a FHIR backend.

When findings, orders, problems, and allergies are first-class resources rather than text blobs, you get:

- Trends across visits and population health queries
- Search and alerts on real values
- Exchange with other systems without bespoke scraping
- A clearer path to quality measures and analytics

Questionnaires and visit templates are the right lever for structure. Parse submissions into [`Observation`](/docs/api/fhir/resources/observation), [`Condition`](/docs/api/fhir/resources/condition), [`ServiceRequest`](/docs/api/fhir/resources/servicerequest), and related types; narrative still belongs where clinicians need it – for example, assessment prose on [`ClinicalImpression`](/docs/api/fhir/resources/clinicalimpression).

## How Much Structure Is Enough?

There is no single answer – urgent care, behavioral health, and procedural specialties impose different rhythms. The tradeoff looks like this:

| | More structured | More free text |
|---|---|---|
| **Strengths** | Queryable, exchangeable, alertable; feeds population health and quality measures | Familiar to clinicians; fast to write; flexible for complex narrative |
| **Costs** | Form design + change management overhead; adoption friction | Not queryable as-is; search, handoffs, and quality measures need custom extraction later |

Adoption matters as much as architecture. Structure should not erase workflows clinicians have years of muscle memory for. If a section is faster as narrative, force-fitting a form is a step backward.

A practical default: structured Subjective, Objective, and Plan paired with narrative Assessment – surfaced alongside a patient summary (problems, allergies, active medications) and inline orders as concrete FHIR requests.

:::note

Clinical operations teams often maintain a fuller discovery checklist (specialties, encounter modalities, signing policy, template ownership). Use this page as the architectural spine; capture local requirements in whatever artifact your organization already uses.

:::

## See Also

- [Visit Templates and the SOAP Approach](/docs/charting/visit-templates)
- [Chart Data Model](/docs/charting/chart-data-model)
- [Parsing Questionnaire Responses](/docs/questionnaires/structured-data-capture)
- [Authoring Clinical Protocols](/docs/careplans/protocols)
- [Provider Visits](/docs/provider/visits)
- [Scheduling](/docs/scheduling/)

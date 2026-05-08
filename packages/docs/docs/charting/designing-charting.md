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

Charting is one of the defining features of an electronic medical record. It is where clinical work becomes a lasting record: what was observed, decided, ordered, and communicated. Clinicians have strong preferences shaped by training, specialty, and years in other systems, and the surface experience varies enormously—dense structured forms in some products, narrative-first layouts in others—while the underlying record still has to support safe care and downstream use of the data.

In Medplum, that record covers the patient summary, encounter documentation, orders, and signing. Medplum is headless: you choose screens, flows, and affordances. The sections below summarize how we think about charting architecture so product decisions line up with a FHIR-native backend; they are not a full discovery workbook.

## Why Structure Pays Off with FHIR

Every implementation balances structured capture (picklists, measurements, questionnaires) with free narrative (assessment paragraphs, context that does not fit a widget). Leaning structured where the workflow allows is how you get the most from storing charting in FHIR.

When findings, orders, problems, and allergies live as first-class resources rather than blobs of text, you get trends across visits, search and alerts on real values, exchange with other systems, and a clearer path to analytics and population health—without bespoke scraping. Questionnaires and visit templates are usually the right lever for structure; parsing submissions into [`Observation`](/docs/api/fhir/resources/observation), [`Condition`](/docs/api/fhir/resources/condition), [`ServiceRequest`](/docs/api/fhir/resources/servicerequest), and related types connects the UI to that model. Narrative still belongs where clinicians need it—for example assessment prose on [`ClinicalImpression`](/docs/api/fhir/resources/clinicalimpression)—alongside structured facts.

This is a recommendation, not a prohibition on rich text. Unstructured-only charting shifts cost to custom pipelines and weakens the payoff of building on FHIR.

## How Much Structure Is Enough?

There is no single answer: urgent care, behavioral health, and procedural specialties impose different rhythms, and async or telehealth visits may pull context from messaging rather than a single scrollable note. The tradeoff is consistent—more structure improves queryability and exchange at the cost of design and change management; heavy free text feels familiar quickly but makes search, quality measures, and handoffs harder unless you add separate extraction work later.

Adoption matters too. Structure should not erase workflows clinicians have years of muscle memory for; if a section is faster as narrative for the people writing it, force-fitting a form is a step backward. A practical default is structured Subjective, Objective, and Plan paired with narrative Assessment, surfaced alongside a patient summary (problems, allergies, active medications) and inline orders that stay with the visit as concrete FHIR requests.

:::note

Clinical operations teams often maintain a fuller discovery checklist (specialties, encounter modalities, signing policy, template ownership). Use this page as the architectural spine; capture local requirements in whatever artifact your organization already uses.

:::

## See Also

- [Visit Templates and the SOAP Approach](/docs/charting/visit-templates)
- [Chart Data Model](/docs/charting/chart-data-model)
- [Structured Data Capture](/docs/questionnaires/structured-data-capture)
- [Authoring Clinical Protocols](/docs/careplans/protocols)
- [Provider Visits](/docs/provider/visits)
- [Scheduling](/docs/scheduling/)

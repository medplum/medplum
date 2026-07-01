---
sidebar_position: 0
---

# Intake & Registration

:::tip[Planning this workflow?]
The [Intake & Registration Decision Guide](https://docs.google.com/document/d/e/2PACX-1vSxm_SpJn4-kiX-OEs1gRqVP8zBpDYeENweyj7N6e5R-vF6KS5khX4xWy4yg0XGriETWENVIY-zvEVo/pub) walks through requirements questions and FHIR modeling decisions for intake — use it alongside these docs.
:::

Patient intake is the process of collecting demographic, insurance, medical history, and consent information when a patient first interacts with your practice or returns for a visit. In FHIR terms, this means capturing a [`QuestionnaireResponse`](/docs/api/fhir/resources/questionnaireresponse) and transforming it into structured resources — [`Patient`](/docs/api/fhir/resources/patient), [`Coverage`](/docs/api/fhir/resources/coverage), [`Consent`](/docs/api/fhir/resources/consent), [`Condition`](/docs/api/fhir/resources/condition), and more — that the rest of your clinical system can use.

This section covers how to model, design, and automate intake workflows in Medplum:

- [**Intake Data Model**](/docs/intake/intake-data-model) — The FHIR resources created during intake, how they relate to each other, and which US Core profiles apply
- [**Intake Questionnaires: Design and Extraction**](/docs/intake/intake-questionnaires) — How to structure intake questionnaires so their responses can be reliably transformed into FHIR resources, using either SDC extraction or Bot-based processing
- [**Post Intake Automation**](/docs/intake/post-intake-automation) — Triggering processing with Subscriptions, post-intake workflows, and optional PlanDefinition-based orchestration

For a working reference app, see the [Patient Intake Demo](https://github.com/medplum/medplum/tree/main/examples/medplum-patient-intake-demo).

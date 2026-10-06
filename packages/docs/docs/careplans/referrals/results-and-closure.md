---
title: Results and Closing the Loop
---

# Results and Closing the Loop

The specialist saw the patient, but the referring team is still waiting for the note. From one team's perspective the service is complete; from the other's, there is work left to do. Model both so that a referral doesn't disappear from the queue too early.

## Link the Returned Evidence

| Returned record | Link to the original referral |
| --- | --- |
| Diagnostic result | `DiagnosticReport.basedOn` references ServiceRequest |
| Completed consultation | `Encounter.basedOn` references ServiceRequest |
| Consultation note or PDF | `DocumentReference.context.related` references ServiceRequest; attachment URL references Binary |
| Message from the receiving team | `Communication.about` references ServiceRequest, with returned documents in the message payload |

For a DocumentReference, use `context.encounter` only for an Encounter or EpisodeOfCare. A referral reference belongs in `context.related`. The [R4 DocumentReference definitions](https://hl7.org/fhir/R4/documentreference-definitions.html#DocumentReference.context.related) describe this distinction.

Preserve the patient, author, clinical status, and relevant times on each returned record. If a DiagnosticReport has a rendered report, its `presentedForm` can use a Binary URL; it should not embed base64 attachment data.

## Match Before Attaching

Prefer source referral identifiers and the correlation established during exchange. Verify the patient and service context as well. A patient can have several open referrals, so matching only on patient or specialty is insufficient.

When the identifiers are missing or contradictory, preserve the returned document and create review work before attaching it to a clinical request. Keep uncertain material in the restricted intake workflow described in [Receiving and Triage](/docs/careplans/referrals/receiving-and-triage).

Deduplicate repeated deliveries using stable source identifiers. A corrected report is a revision to evaluate, not necessarily a duplicate to discard; preserve its relationship to the prior document or result.

## Review the Result and Assign Follow-Up

Create a review Task when the referring team must acknowledge or act on returned information. Its `focus` can reference the ServiceRequest, and `input` can reference the returned DocumentReference or DiagnosticReport. Assign the eligible reviewer and populate `for` for the patient.

Record the review disposition and rationale. Reference any resulting clinical request in `output`, and track its fulfillment separately. A clinician may finish reviewing a note while leaving a new follow-up obligation for the coordinator.

Use a stable identifier for the review work, derived from the referral and returned result/version or another defined review occurrence. Repeated delivery of the same report should not create repeated open review Tasks. Define when an amended report warrants another review.

## Define Completion for Each Side

| Record | What completion means |
| --- | --- |
| Scheduling Task | The required booking has been made |
| Fulfillment Task | The requested work represented by that Task has finished |
| ServiceRequest | The requested service has been performed, reconciled through the responsible request authority |
| Results-review Task | The returned evidence has been reviewed and required next steps recorded |
| Overall coordination Task, if used | The practice's defined closure criteria have been met |

Use an appropriate terminal `Task.status` as well as the local `businessStatus`. A business-stage label alone does not close the Task. If the service was declined or cancelled, record that outcome rather than marking the ServiceRequest completed.

For closed-loop workflows, completion usually needs both returned evidence and review. For outbound tracking that ends at acceptance, document that narrower boundary clearly in the product and reports.

## Handle Missing Results and Reopened Work

A scheduled Bot can identify work past its agreed deadline and create or escalate a follow-up obligation once. Follow the [Medplum deadline convention](/docs/careplans/handoffs-and-escalation#represent-time-accurately), including pause rules and date-range queries.

When new information arrives after closure, preserve the original completion history. Create a new review Task for genuinely new work, or reopen an existing Task only under a defined lifecycle policy. Report the additional interval separately; `lastModified` alone cannot tell you how long either interval lasted.

See [Operational Reporting](/docs/careplans/operational-reporting) for queue age, turnaround time, and completion measures.

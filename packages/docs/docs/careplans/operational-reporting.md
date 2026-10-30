---
title: Operational Reporting
---

# Operational Reporting

A coordinator needs to see what is waiting today. A team lead may want to know why the same queue took longer to clear last month. These views use the same workflow records, but they need different queries.

Use current FHIR resources for actionable lists. For historical measures, capture the transitions that tell you when work arrived, changed hands, paused, and finished.

## Show the Team What Needs Attention Today {/* #build-current-work-lists */}

Use Task searches for owner, lifecycle status, work type, and local business stage. For example:

```http
GET /fhir/R4/Task?owner=PractitionerRole/coordinator&status=ready,in-progress,on-hold
GET /fhir/R4/Task?owner:missing=true&status=ready
GET /fhir/R4/Task?focus=ServiceRequest/example
```

An unowned pool uses `owner:missing=true`; a group-owned queue searches for that Organization, HealthcareService, or CareTeam instead. Add the work-type or role filter that defines the pool. Follow pagination rather than treating the first page as the complete queue.

For deadlines, follow the [Task date-range guidance](/docs/careplans/tasks#searching-by-due-date-range). Use the [planned-date convention](/docs/careplans/handoffs-and-escalation#represent-time-accurately) consistently, including its interoperability limits, and account for the project's date-range indexing behavior. Tasks with no deadline are a separate group, not automatically on time.

Run operational and aggregate queries under the [access rules agreed for the workflow](/docs/careplans/teams-and-delegation#assignment-and-access).

## Capture When Work Changed Hands {/* #build-a-transition-model */}

:::caution[Editing a note should not reset queue age]

`Task.lastModified` and `meta.lastUpdated` describe the latest edit, which might be a note correction. Neither field alone tells you when the current stage began. Compare [resource-history versions](/docs/fhir-datastore/resource-history) to detect stage and owner changes.

:::

For structured actor, reason, or business-event time, create `Provenance` targeting the affected resource version. Use `occurredDateTime` for the effective event time and `recorded` for when it was recorded. These can differ for delayed inbound updates. Provenance supplements history; it does not automatically contain old and new status values.

A reporting table can contain:

| Column | Meaning |
| --- | --- |
| Task ID and resource version | Stable identity and source-version deduplication key |
| Previous/new lifecycle, stage, and owner | What changed, derived from the relevant versions |
| Effective time and recorded time | When it happened and when the system learned about it |
| Actor and reason | Context from the workflow record or explicit Provenance |
| Patient, request, and plan references | Dimensions for authorized aggregation |

Build this table in your reporting store. Make ingestion replayable, tolerate late events, and retain enough source history to rebuild intervals.

## Agree on What the Clock Measures {/* #define-measures-before-calculating-them */}

Two teams can both report "turnaround time" and measure different things. Settle the start, stop, and pause rules before comparing their numbers.

| Measure | Definition to settle |
| --- | --- |
| Queue age | Time since initial readiness, arrival at the current team, or entry into the current stage |
| Turnaround time | Start/end events, business calendar, and excluded waiting intervals |
| Overdue work | Which open states count and what happens when a clock pauses |
| Handoff rate | Owner changes versus distinct independently assigned steps |
| Completion rate | Eligible population, time window, and treatment of cancellations or reopened items |

Count work at the appropriate level. One referral may have several Tasks, so completed Task counts do not produce a referral completion rate. A reopened item needs another interval; do not replace its original completion time in reporting history.

## Put Work Completion Alongside Patient Progress {/* #connect-to-clinical-outcomes */}

Use Goal targets, `achievementStatus`, and supporting Observations for clinical progress. Report them alongside work completion without treating one as proof of the other. The clinical team defines measures and denominators; the pipeline preserves the evidence and timing needed to calculate them.

:::tip[Start with one measure you can explain]

Start with an open-work dashboard and one well-defined turnaround measure. Add measures once transitions and exception handling are reliably captured.

:::

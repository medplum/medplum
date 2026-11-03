---
title: Handoffs, Deadlines, and Escalation
---

# Handoffs, Deadlines, and Escalation

An item marked "done" can still leave the next person wondering what to do. A useful handoff tells them what is ready, what evidence to review, and who to contact if they get stuck. Use Tasks to make that next obligation visible, with its own owner and completion criteria.

## Decide What Done Means {/* #define-lifecycle-and-completion */}

Use `Task.status` for its R4 lifecycle and `businessStatus` for local stages such as waiting for documents or awaiting review. Publish the local stage codes and permitted transitions. Use `statusReason` to explain the current blocked, failed, or cancelled state.

For internally actionable work, `ready` can identify an item available to perform. Use `requested`, `received`, `accepted`, and `rejected` when the workflow explicitly exchanges and acknowledges a request for work. Set `in-progress` when execution begins, and a terminal status when it ends. Choose `intent` at creation; R4 Task intent is immutable.

Before wiring up a Complete button, decide what the next person needs to see. A scheduling Task might require an Appointment reference; a response Task might require the resolving Communication; a clinical review Task might require a documented disposition. A recommendation may be declined even though its review Task was successfully completed.

```json
{
  "resourceType": "Task",
  "id": "review-assessment",
  "status": "completed",
  "intent": "order",
  "code": { "text": "Review assessment" },
  "for": { "reference": "Patient/example" },
  "focus": { "reference": "QuestionnaireResponse/assessment" },
  "owner": { "reference": "PractitionerRole/reviewer" },
  "executionPeriod": {
    "start": "2026-10-06T16:00:00Z",
    "end": "2026-10-06T16:10:00Z"
  },
  "output": [{
    "type": { "text": "Follow-up request" },
    "valueReference": { "reference": "ServiceRequest/follow-up" }
  }]
}
```

The review is complete; the follow-up ServiceRequest still has its own fulfillment lifecycle.

## Create the Next Work Item {/* #release-the-next-step */}

When preparation completes, the application or a scoped transition Subscription can initiate review. Derive a stable identifier from the source work and next step, and conditionally create the review Task. Replaying the same transition should find that same Task.

For changes that must succeed together, use a [transaction Bundle](/docs/fhir-datastore/fhir-batch-requests), version-check the update, and conditionally create the successor. Newly created resources that reference one another use `urn:uuid` fullUrls. A batch does not provide those transactional guarantees.

:::caution[A parent link does not start the next Task]

Use `partOf` for decomposition into subtasks. Store executable dependency rules in the application or Bot; neither a parent link nor the existence of a PlanDefinition releases work automatically.

:::

## Set Start Dates and Deadlines {/* #represent-time-accurately */}

Use `authoredOn` for creation time, `executionPeriod` for actual work, and the [Task planned-date convention](/docs/careplans/tasks#task-start--due-dates) for start dates and deadlines.

Use [range-aware date queries](/docs/careplans/tasks#searching-by-due-date-range) when a Task has both a start and an end.

Compute business-hour deadlines in application or Bot logic using a defined time zone, calendar, and pause policy. Capture effective pause/resume times if waiting periods are excluded. Resource history records persistence times; use explicit transition records when those differ from the business event time.

## Give Stuck Work a Way Forward {/* #escalate-without-duplicating-work */}

A scheduled Bot can find overdue open work and reassign it or create a distinct escalation Task. Preserve the original item and its history. Use a stable escalation identifier or milestone to prevent a new alert on every run.

A reminder to a supervisor and a transfer to another coordinator are different actions. Decide whether escalation transfers ownership, requests help, or informs a supervisor. These have different completion rules. Failed automation must leave an actionable recovery path; see [Automating Care Workflows](/docs/careplans/automating-workflows) and [Operational Reporting](/docs/careplans/operational-reporting).

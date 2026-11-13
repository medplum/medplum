---
id: monitoring-bots
title: Monitoring and Recovering Bots
description: Find Bot executions, interpret audit settings, and recover incomplete workflows.
---

Monitor the whole operation a Bot performs: whether its trigger fired, whether the handler ran, and whether the intended result reached FHIR or an external system. A successful invocation is useful evidence, but a business workflow may include additional asynchronous steps.

For deployment setup, see [Bots in Production](/docs/bots/bots-in-production).

<span id="viewing-a-bots-events"></span>

## Find an invocation

In the Medplum App, open the Bot and select its **Event** tab. The route is `/Bot/{id}/event`. Persisted `AuditEvent` records show the outcome and execution information, including captured console output.

Start an investigation with:

- The **Bot ID and execution time** to locate the invocation.
- The **source resource or event identifier** to connect the trigger and output records.
- The **deployment revision** to identify the code that ran.
- Any **external request identifier** needed to look up the downstream result.

Execution AuditEvents belong to the project whose membership the run assumes. When a [Cron invokes a Bot from a linked project](/docs/bots/bot-cron-job#running-a-bot-from-a-linked-project), look for the stored event in the executing project.

The standard audit outcome codes are `0` (success), `4` (minor failure), `8` (serious failure), and `12` (major failure). Read the outcome description and associated records to determine the actual failure; the numeric code alone does not describe which business steps completed.

<span id="audit-events-missing"></span>

## Understand the logging settings

The Event tab shows stored `AuditEvent` resources. Its contents depend on the Bot's audit settings and the viewer's access.

| Setting                               | Effect                                                                                                                       |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `auditEventTrigger: always`           | Create execution audit events for every run, subject to the destination setting. This is the default trigger.                |
| `auditEventTrigger: on-error`         | Create an execution audit event when the run reports an error.                                                               |
| `auditEventTrigger: on-output`        | Create an event when its outcome description is nonempty.                                                                    |
| `auditEventTrigger: never`            | Skip execution audit event creation, including the execution audit log entry.                                                |
| `auditEventDestination: ["resource"]` | Write eligible events as FHIR resources, visible in the Event tab, and emit audit logs when `logAuditEvents` is enabled. This is the default destination. |
| `auditEventDestination: ["log"]`      | Send eligible events to the server audit logger without storing FHIR resources. Audit logging must be enabled on the server. |

Execution audit events that pass the trigger filter are also sent to the server audit logger. For self-hosted deployments, `logAuditEvents` must be enabled for those entries to be emitted; use your configured log collector to read them. See [Log Streaming](/docs/integration/log-streaming) for the hosted integration. Review retention and access for the destinations your team uses.

The captured console output in `outcomeDesc` retains the end of the output, so earlier messages can be truncated. The server settings `maxBotLogLengthForResource` and `maxBotLogLengthForLogs` control the limits independently; both default to 10,240 UTF-16 code units.

<span id="troubleshooting"></span>

## Diagnose by workflow stage

| Symptom                                   | Investigation                                                                                                                      |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| No invocation is visible                  | Check the audit settings first, then the trigger's status, criteria, target, and schedule. Check the trigger's own logs or events. |
| The handler cannot start                  | Confirm that executable code was deployed and that the selected runtime and dependencies match the artifact.                       |
| A read or write fails                     | Check the execution membership, access policy, input, and returned `OperationOutcome`.                                             |
| An external request times out             | Look up the request in the external system using its correlation or idempotency identifier before retrying.                        |
| Some outputs exist and others are missing | Identify the last completed step and reconcile the partial result.                                                                 |
| Work stops after repeated failures        | Check whether the Subscription is still active and whether a configured failure policy disabled it.                                |

For Subscription triggers, distinguish failure to deliver an invocation from a handler that ran and reported an error. Retry behavior depends on the trigger and failure path. Use [Subscription Extensions](/docs/subscriptions/subscription-extensions) for the available controls and inspect the actual event before deciding to replay.

## Recover an item safely

1. **Identify the input.** Record the source event or resource version involved in the failure.
2. **Inspect the result.** Check for FHIR records and external side effects that already succeeded.
3. **Correct the cause.** Deploy the fix or correct the relevant configuration, credentials, or source data.
4. **Replay a selected item.** Use the application's documented replay path and the same business idempotency key. Confirm the input version that the replay will use.
5. **Verify completion.** Check the output records and downstream acknowledgement, then resolve the operational task tracking the failure.

If the handler now receives a newer version of a resource, the replay can produce a different result from the original invocation. Decide whether recovery should process the original event or reconcile the resource's current state.

## Monitor the queue of unfinished work

In addition to error counts, track the number and age of items waiting for completion. A Bot can run successfully while a downstream response never arrives. Define a completion signal for each workflow and a responsible team for overdue or failed items.

For example, a lab submission workflow can correlate the source order, the submission result, and the subsequent acknowledgement. Alerts should identify the stage that needs attention so an operator can act without reading every log line.

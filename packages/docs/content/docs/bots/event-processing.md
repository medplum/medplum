---
id: event-processing
title: Implementing Event Processing
sidebar_label: Implementing Event Processing
---

This page connects Bot setup, triggers, background execution, and recovery. It includes a resource-change example that creates one review Task for each completed preparation Task, plus a recovery function that uses the same processing logic.

{{< tip title="Choose your approach" >}}

Use the [Event Processing and Automation Decision Guide](/docs/decision-guides/event-processing-and-automation) to choose where processing runs, what triggers it, and whether the caller waits.

{{< /tip >}}

## Prepare the execution environment

For a Bot:

1. Enable the project's `bots` feature and create a Bot with its own `ProjectMembership`. Follow [Bot creation and registration](/docs/bots/bots-in-production#creating-your-bot); for an introduction, see [Bot Basics](/docs/bots/bot-basics).
2. Assign an [AccessPolicy](/docs/access/access-policies) that permits the reads, searches, and writes the handler requires. Configure [Bot secrets](/docs/bots/bot-secrets) for external credentials.
3. Store the handler in source control, [test and bundle it](/docs/bots/bots-in-production#set-up-the-repository-and-build), and [deploy the built artifact](/docs/bots/bots-in-production#deploying-your-bot). Use separate deployment and execution identities as described in [Bots in Production](/docs/bots/bots-in-production#setting-up-your-permissions). Deploy before enabling its triggers.

Hosted Medplum Bots run on AWS Lambda. Check the [Bot package limits](/docs/bots/bot-basics#medplum-lambda-bots-size-limits), dependency support, and your deployment's execution time and memory limits before choosing long-running or resource-intensive processing. Self-hosted deployments can use other configured runtimes, including [Fission](/docs/bots/running-bots-on-fission); [local development](/docs/bots/running-bots-locally) uses a VM context. Asynchronous invocation does not remove the runtime's limits.

## Use an external service

Authenticate your service using a `ClientApplication` and [client credentials](/docs/auth/client-credentials), with an AccessPolicy limited to its work. Keep its credentials on the server.

For resource-change processing, configure a Subscription's `channel.type` as `rest-hook` and its `channel.endpoint` as your HTTPS receiver URL. Apply the same scoped criteria and transition rules shown below. Configure and verify [Subscription signatures](/docs/subscriptions/subscription-extensions#signatures) against the received payload before accepting work.

If the receiver queues work, durably store the event or work reference before returning a successful acknowledgment. A successful webhook response ends delivery responsibility for that attempt; it does not tell Medplum whether the service's worker later succeeded. Your service must retain processing state, retry or reconcile failed work, and monitor its queue. Configure [delivery retries](/docs/subscriptions/subscription-extensions#retry-policy) for failed HTTP delivery separately from worker retries.

## Invoke processing directly

Use [Bot `$execute`](/docs/api/fhir/operations/bot-execute) for an authenticated invocation. Without `Prefer: respond-async`, the request waits for the Bot result. Treat transport failures and timeouts as uncertain outcomes when the Bot might already have written data or called another service.

Use [custom FHIR operations](/docs/bots/custom-fhir-operations) to give Bot logic a named operation interface through an `OperationDefinition`. This is still Bot execution. Custom operation routes do not implement the `$execute` asynchronous response mechanism.

For rules that must reject an action, validate before committing the action and restrict write access so callers cannot bypass the controlled path. A custom operation alone does not intercept ordinary FHIR writes. Use [FHIR profiles](/docs/fhir-datastore/profiles#profile-adoption) for resource validation and [AccessPolicy write constraints](/docs/access/access-policies#write-constraints) for writer-specific FHIRPath rules. For multiple writes, use the [write-pattern guidance](/docs/fhir-datastore/fhir-batch-requests#choosing-a-write-pattern): save prerequisites, confirm success, and then submit dependents, using stable identifiers and per-operation result handling. Atomic transaction Bundles are currently unavailable on hosted Medplum. If partially committed state would violate a business rule, revisit the flow; retries cannot supply atomicity.

{{< note title="Pre-commit interceptors are a separate capability" >}}

Medplum also supports pre-commit Bot interceptors gated by the server's [`preCommitSubscriptionsEnabled` configuration](/docs/self-hosting/server-config#precommitsubscriptionsenabled) and the project's setting of the same name. These can reject writes and are separate from the post-save Subscriptions covered below. The public documentation currently describes the server switch, but lacks a complete implementation guide covering configuration, execution authority, and failure behavior. Confirm availability and those constraints with your deployment operator before selecting this path.

{{< /note >}}

## Process a resource change

This example implements **one review Task per completed preparation Task**. Completing preparation is the saved intention to create a review. Creation of the review Task completes the automation step; completion of the review itself is a separate human workflow.

### Define the example's contract

- Preparation Tasks use the local work code `prepare-review`, and review Tasks use `review`. Replace the example namespace with your application's documented namespace.
- Each preparation Task has `Task.for` referencing its patient. Copying that reference to the review gives it its own patient context; `focus` alone does not supply patient-compartment access.
- Completed preparation is final in this workflow. Keep the source, its patient context, and the generated Task's identifier available for recovery. Do not delete a review to represent cancellation; retain its status and identity.
- The generated review starts in an unassigned `ready` queue. Your application must provide [assignment and queue handling](/docs/careplans/tasks#task-assignment).

If your workflow allows completed preparation to be reopened, corrected, or cancelled, define what happens to the review and whether a later completion represents a new occurrence. Re-reading the source reduces stale processing but does not lock it. If eligibility and creation must be atomic, this example is insufficient. Atomic transaction Bundles are currently unavailable on hosted Medplum; redesign the flow or choose a supported operation that enforces the required invariant.

### Deploy the handler

The handler re-reads current state, validates patient context, and conditionally creates a review by a stable identifier. Repeated calls reuse the review without resetting its progress.

{{< code-example file="packages/examples/src/bots/event-processing.ts" language="ts" blocks="review-bot" >}}

The Bot's AccessPolicy must permit reading preparation Tasks, searching for existing review Tasks, and creating review Tasks. Ensure all executions use the same identity namespace and can see the existing matches. An identifier is not a global uniqueness constraint if writers bypass the conditional-create convention.

### Configure the Subscription

After deploying the Bot, create the Subscription returned by this function using an authorized setup client, for example `await medplum.createResource(reviewSubscription(botId))`. Create it once during configuration, rather than on every application startup.

{{< code-example file="packages/examples/src/bots/event-processing.ts" language="ts" blocks="review-subscription" >}}

The criteria select completed preparation Tasks. The interaction extensions exclude deletes. The FHIRPath expression accepts creation in the completed state and updates where status changes; a later edit while status remains completed does not run the Bot. To require an update from an earlier state, remove the `create` interaction. See [Subscription Extensions](/docs/subscriptions/subscription-extensions) for these Medplum-specific extensions.

The generated review has a different work code, so it does not match this Subscription. Review the other Subscriptions in the project for circular paths as well.

Check the Subscription's account scope as well as its criteria: `meta.accounts` can restrict which matching resources trigger it. See [Publish and Subscribe](/docs/subscriptions/publish-and-subscribe) for setup and troubleshooting, including account scope inherited during creation.

### Recover a missed creation

Use the following function from an authorized recovery script or a separately scheduled Bot. It follows search pagination and calls the same conditional-create logic. Existing review Tasks, including completed or cancelled ones, remain unchanged.

{{< code-example file="packages/examples/src/bots/event-processing.ts" language="ts" blocks="review-recovery" >}}

This small example scans all completed preparation Tasks and stops on an error so the run reports failure. Each run makes paginated search requests, then a fresh read and conditional-create request for each still-eligible preparation, including those with existing reviews. API usage therefore grows with the completed history. For larger workloads, process bounded partitions with saved progress and record individual failures for repair. A checkpoint must not permanently exclude failed items. Fit each run within execution and API rate limits.

The persisted preparation and review resources supply recovery evidence for this step. An execution log alone does not. If you add more steps, persist their outcomes or use an explicit work item so recovery can determine which step remains.

## Receive an event from another system

Follow [Consuming Webhooks](/docs/bots/consuming-webhooks) to configure authenticated Bot execution or a public webhook Bot. Public webhook Bots require explicit opt-in and an AccessPolicy. Verify the sender's signature and validate the payload before writing resources. Where JSON signature verification requires the original text, configure the public Bot's `rawBody` setting.

Define an operation identifier from the sender and source event or business occurrence. A delivery-attempt ID is unsuitable if the source changes it on each retry.

If the source needs a quick acknowledgment, the receiver can validate and conditionally save the intended work, then return the required response. A Subscription or scheduled worker processes that saved work, as in the resource-change pattern above. Save the inputs or a durable reference needed to resume it, plus the source correlation identifier. Do not acknowledge before that save succeeds. Public webhook routes do not support `$execute`'s `Prefer: respond-async` behavior; starting an unawaited promise inside the handler is not a durable handoff.

The sender's delivery retry ends at successful acknowledgment. Later processing failures belong to your recovery process.

## Run on a schedule

Use [Cron Jobs for Bots](/docs/bots/bot-cron-job) to configure a Bot schedule. The `Cron` resource supports explicit execution identity and parameters, and requires the project's `cron` feature. Its Bot receives the whole Cron resource as `event.input`, so use a scheduled handler that calls the relevant worker function rather than passing it to a handler expecting a Task.

For example, a scheduled handler can call `recoverReviews(medplum)`. Deploy it separately from the resource-change handler. For recurring obligations, use an identity that includes the due occurrence, rather than the time at which the scheduler happened to run. Define the business time zone, catch-up window, overlapping-run behavior, and stop condition. An external service can use its own scheduler with the same requirements.

## Accept work for background processing

Choose the state and recovery mechanism based on what acceptance promises:

| Path                                                           | What is retained                                                              | What you must implement                                                                                                                                       |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Authenticated Bot `$execute` with `Prefer: respond-async`      | An `AsyncJob` with a status URL and eventual output                           | Retain the job reference, inspect output, detect stalled work, and reconcile before any resubmission. Recovery after interruption requires application logic. |
| Saved FHIR work followed by a Subscription or scheduled worker | The source resource or work item, identity, and processing evidence you model | Save before acknowledging, make the handler repeatable, expose unfinished work, and run recovery. The preparation/review example uses this path.              |
| External service with a durable queue                          | The service's accepted message and processing state                           | Acknowledge only after durable acceptance; configure queue recovery, outcome tracking, and reconciliation with Medplum.                                       |

### Track asynchronous Bot execution

Follow the [asynchronous `$execute` example](/docs/api/fhir/operations/bot-execute#asynchronous-execution) to obtain the `Content-Location` status URL and poll it with an authorized client. The SDK's automatic polling returns the terminal `AsyncJob`, not the Bot's unwrapped result.

For this operation, `accepted` can remain the status while the Bot runs. `completed` means the asynchronous wrapper finished; inspect the output for a failing `OperationOutcome` and apply your Bot's own result contract. A successful HTTP response from the status endpoint alone does not establish business success.

The asynchronous execution path does not persist the request body as a resumable work queue, automatically retry Bot failures, or resume execution after a server interruption. A job can remain unfinished after interruption. Do not rely on job cancellation to interrupt the Bot or undo effects. Keep the inputs and operation identity elsewhere if recovery must reconstruct the action.

### Retain business work when execution status is insufficient

For multi-step or consequential work, retain the intended action, its stable identity, necessary input references, current processing state, completion evidence, and error or reconciliation reason. Use an existing workflow resource when it already represents this information. Use [Task](/docs/careplans/tasks) when it fits the work's lifecycle; a Task does not itself execute or retry anything.

Distinguish queued work, claimed work, completed work, and work needing intervention in your model. Claim competing work with [version checking](/docs/fhir-datastore/updating-data#preventing-lost-updates-with-version-checking). Define how an expired claim is inspected and recovered after a worker stops. Do not equate a claim with proof that an external action has not happened.

Expose status to the relevant caller or operator with appropriate access controls. The meaning of completion should be an observable result, such as the review Task's existence, rather than simply that a handler ran.

## Make repeated processing safe

1. **Choose the operation identity.** Use a stable command ID, source plus step, or source plus due occurrence. Add a version only when each version truly represents separate work.
2. **Create generated resources conditionally.** Use `createResourceIfNoneExist` with an identifier query, as above. A search followed by an ordinary create races with concurrent executions. All writers must follow the identity convention.
3. **Protect competing updates.** Use `If-Match` to reject stale versions. On a conflict, re-read and re-evaluate the business action rather than blindly overwriting newer state. Version checking protects an individual write. For linked writes, confirm prerequisites before writing dependents and handle partial failure explicitly.
4. **Choose stale-event behavior.** A current-state projection can re-read and recompute. A workflow needing every historical transition needs retained event or work records and its own ordering and recovery strategy. A Subscription is not an ordered, permanent event archive.
5. **Protect external side effects separately.** A conditional FHIR create does not make an email, payment, or other remote action idempotent. Reuse the provider's idempotency key for the same operation where supported.

See [Working with FHIR Data](/docs/fhir-datastore/working-with-fhir#creating-patient), [Version Checking](/docs/fhir-datastore/updating-data#preventing-lost-updates-with-version-checking), and [Batch Write Patterns](/docs/fhir-datastore/fhir-batch-requests#choosing-a-write-pattern) for the write mechanics.

## Recover failed or missed work

Follow [Recover an item safely](/docs/bots/monitoring-bots#recover-an-item-safely) to identify the input, inspect existing effects, correct the cause, and verify the result. Choose the recovery path for the type of failure:

- **External Subscription delivery:** HTTP delivery has bounded retries configured through [Subscription extensions](/docs/subscriptions/subscription-extensions#retry-policy). Retries can be skipped when a newer resource version exists or the Subscription is no longer active. They are not a substitute for reconciliation.
- **Bot processing:** A Bot execution failure can be recorded in its AuditEvent without causing the Subscription to retry. Do not depend on Subscription retry settings to rerun failed Bot business logic. Recover from retained work state, as in `recoverReviews`.
- **Missed resource processing:** An administrator can use [`$resend`](/docs/api/fhir/operations/resend) for selected Subscription notifications. This reprocesses the current resource, not an arbitrary historical event. Use a recovery worker when you need to reconstruct missing work from current state.
- **Uncertain external action:** Retain the request's correlation key. Retry with the same provider-supported idempotency key within its documented guarantees, or query/reconcile the outcome before resending. If the outcome cannot be determined safely, mark the work for operator review.

For multi-step processing, record each irreversible outcome before advancing to dependent work. Plan compensation or operator repair where a later step can fail; a synchronous handler and a FHIR transaction cannot roll back an external action.

## Set execution authority

By default, a Bot uses the AccessPolicy on its own ProjectMembership. [`runAsUser`](/docs/bots/bot-run-as-user) changes the execution context to that of the triggering identity. For Subscription-triggered Bots, this is derived from the triggering resource's `meta.author`. Changes authored by `system` skip `runAsUser` Bots because there is no user membership; the server logs a warning without a Bot execution AuditEvent. A `Cron` resource explicitly selects its execution membership through `onBehalfOf`.

Decide whether recovery should use service authority or the original user's authority, especially if that user has since lost access. Store business attribution separately where necessary. An external service uses its ClientApplication permissions unless you explicitly implement a supported user-context flow. See [Access Control](/docs/decision-guides/access-control) for permission design.

## Monitor and test the flow

Use [Monitoring and Recovering Bots](/docs/bots/monitoring-bots) to configure execution evidence and [monitor unfinished work](/docs/bots/monitoring-bots#monitor-the-queue-of-unfinished-work). Correlate executions with work and source identifiers, while limiting sensitive inputs in logs. Alert on both execution failures and business work that remains unfinished beyond its expected time; logs can show a successful execution that did not complete the intended business process.

Before enabling production triggers, verify the applicable cases:

- A valid event creates the intended result; unrelated updates and output resources do not trigger new work.
- Duplicate and concurrent deliveries reuse the intended operation without resetting completed work.
- A stale event respects cancellation, newer state, and the workflow's occurrence policy.
- Failure before acceptance is reported to the caller; failure after acceptance is visible and recoverable.
- Timeouts, process interruption, and uncertain external outcomes do not cause blind resubmission.
- Execution and recovery identities have the intended permissions, and callers can see only their permitted status information.

Test handlers with [Unit Testing Bots](/docs/bots/unit-testing-bots), then follow [test-project verification](/docs/bots/unit-testing-bots#verify-behavior-on-a-test-project) to exercise the configured trigger, permissions, and failure paths. A unit test does not prove the deployed Subscription or scheduler is configured correctly.

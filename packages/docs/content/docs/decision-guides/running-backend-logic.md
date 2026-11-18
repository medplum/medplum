---
id: running-backend-logic
title: 'Running Backend Logic: Bots and Subscriptions'
sidebar_label: Running Backend Logic
weight: 140
download_slug: running-backend-logic
aliases:
  - /docs/decision-guides/event-processing-and-automation
  - /docs/decision-guides/fhir-event-notifications
---

Should your code run when FHIR data changes, when an application calls it, when an external service sends an event, or on a schedule? This guide helps you choose what starts the code (its trigger) and where the code runs.

- **A [Bot](/docs/bots)** runs your custom JavaScript or TypeScript function in Medplum. That function is called the handler.
- **A [Subscription](/docs/subscriptions)** defines which FHIR resource changes send a notification to your code. It can invoke a Bot or send an HTTP request to your service's HTTPS URL, called an endpoint.

For example, a Subscription can detect a newly created Patient and invoke a Bot that registers that patient in another system. The Subscription selects the change; the Bot performs the action. The FHIR event notifications covered here are sent after a resource change is saved.

**We recommend Medplum Bots for handling FHIR event notifications.** The Bot framework provides a Medplum client, configurable permissions, project secrets, and execution logging. On hosted Medplum, it also manages the execution infrastructure.

1. **[Choose what starts the work](#decision-1-what-should-start-the-work).** Select a trigger for each use case.
2. **[For a Subscription, choose its destination](#decision-2-where-should-this-subscription-send-notifications).** Start with a Bot; consider your own endpoint for specific service or runtime requirements.
3. **[For a Subscription, choose its matching changes](#decision-3-which-changes-should-trigger-this-subscription).** Select creation, updates, a specific state transition, or deletion based on its purpose.

---

## Decision 1: What should start the work?

**Choose the trigger separately for each Bot**, according to the source of work. Different Bots in the same application can use different triggers. A Bot can support multiple triggers when its handler accepts each input format and runs with appropriate permissions. If two triggers can start the same action, ensure they do not perform it twice.

### Option A: FHIR resource change → Subscription

Use a Subscription when the action should follow matching FHIR resource changes, including changes made by other applications or integrations.

- **Example:** Start a registration integration when a Patient is created.
- **Best fit:** The saved resource change is what should start the action.
- **Tradeoff:** The notification happens after the write is committed. A handler failure leaves that write saved, and the application tracks whether the resulting action completed.

Continue to Decisions 2 and 3 to choose the destination and matching changes. For a result or validation response returned to the caller, consider direct invocation below.

### Option B: Application request → direct invocation

Call a Bot when an application explicitly requests a calculation or action. Use the Bot's `$execute` endpoint, or expose the Bot as a custom FHIR operation.

- **Example:** Calculate a score when a user requests it in the application.
- **Best fit:** The application chooses when to run the code and supplies its input. When it waits for the response, the Bot can return a result or validation error.
- **Tradeoff:** The application owns the call and handles its response or failure. Bot execution limits still apply.

If the Bot validates an action, call it before saving that action and ensure callers use that path. Calling a Bot does not automatically add validation to ordinary FHIR writes.

Implementation: [Bot $execute](/docs/api/fhir/operations/bot-execute), [Custom FHIR Operations](/docs/bots/custom-fhir-operations).

### Option C: Recurring time → schedule

Configure a Bot to run on a recurring schedule.

- **Example:** Reconcile records with another system each night.
- **Best fit:** Periodic checks or work that should run at a regular interval.
- **Tradeoff:** Work waits until the next scheduled run. The handler must select the records to act on and handle repeated or overlapping runs safely.

Implementation: [Cron Jobs for Bots](/docs/bots/bot-cron-job).

### Option D: External service event → incoming webhook

An external service sends an HTTP request, called a webhook, to your Bot when an event occurs in that service.

- **Example:** Update a communication record when a messaging provider reports delivery.
- **Best fit:** The event originates outside Medplum and the service supports webhook delivery.
- **Tradeoff:** The handler must verify the sender, validate its payload, and handle the provider's repeated deliveries safely.

Implementation: [Consuming Webhooks](/docs/bots/consuming-webhooks).

**Next:** Decisions 2 and 3 apply to Subscriptions. For other triggers, follow the linked implementation docs and the production checks at the end of this guide.

## Decision 2: Where should this Subscription send notifications?

For each Subscription, start with a Medplum Bot. Use your own endpoint when a specific service or runtime requirement justifies operating the receiver yourself.

### Option A: Medplum Bots (recommended)

- **Advantages:**
  - **Managed hosting:** On hosted Medplum, deploy your handler without operating an HTTPS receiver or a separate application server.
  - **Ready-to-use client:** The handler receives a Medplum client that reads and writes FHIR resources with the Bot's configured permissions.
  - **Integrated access and secrets:** Use an [AccessPolicy](/docs/access/access-policies) to limit what the Bot can access and project secrets for external API credentials.
  - **Built-in execution logging:** Use Bot execution records ([AuditEvents](/docs/bots/monitoring-bots)) and captured console output to investigate runs and failures.
  - **Development tooling:** Use Medplum's Bot testing tools and CLI deployment workflow alongside your application's source control and CI.
- **Tradeoffs:**
  - Code and dependencies must be supported by the Bot runtime and fit its memory and execution time limits.
  - Your team owns the handler's logic, tests, and recovery when an action fails.
- **Best fit:** The recommended starting point for handlers that read or write Medplum resources or call another API.

Implementation: [Configure a Bot destination](/docs/subscriptions/fhir-event-notifications#use-a-medplum-bot), [Bots in Production](/docs/bots/bots-in-production).

### Option B: Your own HTTPS endpoint for specific requirements

Use this path when an existing service must handle the action or a required language, dependency, or execution environment is outside the Bot runtime. Your team takes responsibility for the receiver and its Medplum integration.

- **Advantages:**
  - Keeps the action in an existing service when that service needs to own it.
  - Accommodates runtime requirements the Bot environment cannot meet.
- **Tradeoffs:**
  - Your team hosts, secures, deploys, and maintains the availability of the HTTPS receiver.
  - You verify notification signatures and manage separate API credentials if the service reads or writes Medplum resources.
  - You connect delivery records to your service's logs and monitor both delivery and handler failures.
  - If the receiver queues an action, your service tracks completion and handles worker retries after acknowledging the notification.
- **Best fit:** A concrete requirement for an existing service or a different runtime outweighs the additional integration and operational work.

Implementation: [Configure an HTTPS destination](/docs/subscriptions/fhir-event-notifications#use-your-own-endpoint).

**Next for either option:** For each Subscription, choose which resource changes should start its handler.

## Decision 3: Which changes should trigger this Subscription?

**Choose this separately for each Subscription**, based on its handler's purpose. An application can use different Subscriptions for Patient creation, demographic updates, and QuestionnaireResponse completion. A state transition is an additional filter on creation or updates. Combine the options as needed.

### Option A: Resource creation

Notify the handler when a new resource is saved.

- **Example:** Start a registration integration when a Patient is created.
- **Configuration:** Use `criteria` to select resources and a `create` interaction extension to select creation events.

### Option B: Resource updates

Notify the handler when an existing resource changes.

- **Example:** Synchronize Patient demographics with another system.
- **Configuration:** Resource criteria and an `update` interaction extension. Filter relevant field changes when the handler should run only for those changes.

### Option C: A specific state transition

Notify the handler when a resource enters the state that should start the action.

- **Example:** Handle a QuestionnaireResponse when it becomes completed.
- **Configuration:** Resource criteria, selected `create`/`update` interactions, and a transition expression. A filter for a completed status alone also matches later edits while that status remains completed.
- **Decide explicitly:** Should creation in the target state also send a notification?

### Option D: Resource deletion

Notify the handler when a matching resource is deleted.

- **Example:** Remove a downstream copy of the resource.
- **Configuration:** A `delete` interaction extension and a handler that supports the destination's deletion payload.

Implementation: [Select the resource change](/docs/subscriptions/fhir-event-notifications#select-the-resource-change), [Subscription Extensions](/docs/subscriptions/subscription-extensions).

## Before enabling in production

- **Set permissions.** Give the Bot or service access to the resources its handler needs. For Subscriptions, also verify account scope.
- **Handle repeated execution safely.** Repeated delivery, a repeated request, or a manual rerun should preserve the intended result without duplicating an action.
- **Monitor failures and define recovery.** Use [Bot monitoring and recovery](/docs/bots/monitoring-bots) or your service's monitoring to find failed actions. For Subscriptions, external HTTP delivery has configurable retries; those retry settings do not automatically rerun failed Bot logic.
- **Test the configured trigger.** Verify its inputs, execution identity, intended effects, and failure behavior in a test project before enabling it in production.

Continue with [Bots in Production](/docs/bots/bots-in-production) for deployment and configuration, or [Implementing FHIR Event Notifications](/docs/subscriptions/fhir-event-notifications) for Subscription setup and verification.

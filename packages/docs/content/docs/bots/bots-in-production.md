---
id: bots-in-production
title: Bots in Production
description: Build, test, deploy, monitor, and recover production Bots with separate staging and production environments.
weight: 30
toc_max_heading_level: 2
---

A production Bot needs a repeatable build, an explicit execution identity, a controlled trigger, and a way to diagnose and recover failed work. This guide takes a Bot from source control through staging, deployment, and ongoing operation.

{{< tip title="Choose your processing approach" >}}
Use the [Event Processing and Automation Decision Guide](/docs/decision-guides/event-processing-and-automation) to choose an execution environment, trigger, and completion model for each flow.
{{< /tip >}}

If you are writing your first handler, start with [Bot Basics](/docs/bots/bot-basics). For a local runtime, see [Running Bots Locally](/docs/bots/running-bots-locally).

<span id="this-guide-will-show-you"></span>

## Understand the deployment model

A Bot has several related pieces:

| Piece                                 | Purpose                                                                                  |
| ------------------------------------- | ---------------------------------------------------------------------------------------- |
| Source files in your repository       | The TypeScript implementation, shared modules, tests, and dependency lockfile            |
| Built JavaScript artifact             | The executable file deployed to the Bot's configured runtime                             |
| `Bot` resource                        | The server-side identity of the program, its runtime configuration, and code attachments |
| `ProjectMembership` and access policy | The Bot's permissions when it runs under its own identity                                |
| Trigger                               | A direct invocation, Subscription, webhook, custom operation, or schedule                |

Saving source, deploying executable code, and enabling a trigger are separate actions. Plan them together so that an active trigger always points to a tested deployment.

<span id="setting-up-your-repository"></span>
<span id="create-a-source-file"></span>
<span id="compiling-your-bot"></span>

## Set up the repository and build

Use the public [demo Bots example](https://github.com/medplum/medplum/tree/main/examples/medplum-demo-bots) as a reference for package configuration, tests, and bundling. Keep the Medplum packages on matching versions and use a Node.js version supported by those packages.

Organize reusable code separately from handler entry points:

```text
my-bots/
  src/
    bots/
      receive-order.ts
      receive-order.test.ts
    common/
      identifiers.ts
  dist/
    bots/
      receive-order.js
  medplum.config.json
  package.json
  package-lock.json
```

Run tests and build from a clean dependency installation in CI:

```bash
npm ci
npm test
npm run build
```

Your build should:

- **Type-check** the handler and shared modules.
- **Bundle** each handler and its imported application modules into one deployable JavaScript file.
- **Retain** the artifact and source revision so you can promote or redeploy that release.

The current demo build uses TypeScript and esbuild. Follow [Bot Code Organization and Build Setup](/docs/bots/bot-code-organization) for bundler configuration and runtime-provided dependencies.

{{< note title="Bundle before deploying" >}}
Compiling with `tsc` alone does not bundle shared files or third-party dependencies. Deploy the JavaScript artifact produced by your bundler.
{{< /note >}}

Retain the artifact and its source revision for each release. Promoting the tested artifact avoids rebuilding with different dependencies between staging and production.

## Set up deployment and execution identities {#setting-up-your-permissions}

Create a [ClientApplication](/docs/auth/client-credentials) for the deployment environment. Bot deployment requires project-administrator or super-administrator status and write access to the Bot. Scope the CI credential to the intended project and store its secret in your CI secret manager.

The CLI accepts these environment variables:

```bash
export MEDPLUM_CLIENT_ID="your-deployment-client-id"
export MEDPLUM_CLIENT_SECRET="your-deployment-client-secret"
export MEDPLUM_BASE_URL="https://api.medplum.com/"
```

Configure them in your shell, environment file, or CI environment. Keep secrets out of source control and build logs. Use separate deployment credentials for staging and production.

Review both identities before enabling the Bot:

- **Deployment identity:** the CI client that can replace the Bot's executable code.
- **Execution identity:** the membership whose access policy governs the running Bot. Check the Bot's `ProjectMembership.accessPolicy`, including any default policy applied at creation.

Use [Run as User](/docs/bots/bot-run-as-user) when the operation should use the invoking user's access. A [Cron resource](/docs/bots/bot-cron-job#scheduling-with-the-cron-resource) specifies the membership under which scheduled work runs.

Store runtime secrets using [Bot Secrets](/docs/bots/bot-secrets). Deploying the same JavaScript to another project does not copy that project's secrets or integrations.

## Create and register the Bot {#creating-your-bot}

Build the handler and verify that both files are nonempty before running `bot create`:

```bash
test -s src/bots/receive-order.ts &&
  test -s dist/bots/receive-order.js &&
  npx medplum bot create receive-order-staging YOUR_STAGING_PROJECT_ID src/bots/receive-order.ts dist/bots/receive-order.js
```

The command creates the Bot and its membership, saves the source, deploys the executable file, and adds an entry to `medplum.config.json` unless you pass `--no-write-config`. The runtime uses the deployment's default unless you specify `--runtime-version`.

The CLI silently skips saving or deploying a missing or empty file and can still print `Success! Bot created`. Confirm a successful `Deploy result:` before enabling the trigger.

If an upload or deployment fails after the Bot was created, its ID has not yet been printed or written to `medplum.config.json`. Find the Bot in the project's Bot list by name, confirm its ID and membership, and add its configuration entry manually. Then use `bot deploy` to retry the upload and deployment. Running `bot create` again creates another Bot and membership.

The configuration maps a local name to the server resource and files:

```json
{
  "bots": [
    {
      "name": "receive-order-staging",
      "id": "<staging-bot-id>",
      "source": "src/bots/receive-order.ts",
      "dist": "dist/bots/receive-order.js"
    },
    {
      "name": "receive-order-production",
      "id": "<production-bot-id>",
      "source": "src/bots/receive-order.ts",
      "dist": "dist/bots/receive-order.js"
    }
  ]
}
```

Create the production Bot in its own project when you are ready to provision that environment. Its ID and membership are independent of staging.

## Test the workflow in staging

[Unit tests](/docs/bots/unit-testing-bots) check transformations, branching, and expected requests quickly. Follow them with tests against a staging project to exercise the deployed runtime, access policy, trigger, and external service sandbox.

A useful staging scenario follows one operation through its whole lifecycle:

1. Create a representative input and invoke the Bot through the intended trigger.
2. Check the resulting FHIR resources and the external system's response.
3. Deliver the same logical input again and confirm that the business operation is not duplicated.
4. Exercise a rejected request and a failure after some work has already succeeded.
5. Verify that an operator can identify the failed item and recover it using the recorded identifiers.

For external calls, preserve the source event identifier and the provider's request or result identifier. Use the provider's idempotency mechanism when available. For FHIR writes, use stable identifiers with [conditional create or update](/docs/fhir-datastore/working-with-fhir), and inspect each result when submitting a batch. A search followed by a create can race with another invocation.

Subscriptions execute after the triggering resource interaction. Use [FHIR profiles](/docs/fhir-datastore/profiles#profile-adoption) for resource constraints that must reject the original write. Use a Subscription for subsequent work whose failure you can observe and recover.

## Deploy and promote {#deploying-your-bot}

For an existing Bot, deploy the artifact using its configured name:

```bash
npx medplum bot deploy receive-order-staging
```

The CLI saves the source in `Bot.sourceCode` and sends the built file to `Bot/{id}/$deploy`. Deployment uses the Bot's configured runtime. `bot save` updates the source attachment without deploying new executable code.

### Promote to production {#deploying-to-staging-vs-production}

After staging validation, select the production deployment credentials and promote the same artifact:

```bash
npx medplum bot deploy receive-order-production
```

To deploy several configured Bots, quote the pattern so that your shell does not expand it:

```bash
npx medplum bot deploy '*-production'
```

Verify the configured files and CLI output before treating the release as complete:

- **Source and artifact files:** verify that each selected Bot's `source` and `dist` files exist and are nonempty, for example with `test -s dist/bots/receive-order.js`.
- **Saved and deployed counts:** check the intended Bot list, but treat these counts only as a selection check. Missing or empty files are silently skipped and still counted. A pattern that matches no entries can finish without deploying anything.
- **Deployment results:** confirm a successful `Deploy result:` for every selected Bot. A count alone does not confirm that code was deployed.
- **Errors:** review each failed Bot before retrying; other Bots in the same command may have deployed successfully.
- **Execution identity:** confirm the intended membership and access policy, then run a smoke test through the production trigger.

Record the release, Bot IDs, environment, and deployment result before expanding traffic.

## Configure the trigger

Choose the trigger that matches the source of work:

| Work starts when                               | Use                                                                                                                  |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| An application makes an explicit request       | [Execute the Bot](/docs/api/fhir/operations/bot-execute) or expose a [custom FHIR operation](/docs/bots/custom-fhir-operations)      |
| A matching FHIR resource is created or updated | A [Subscription](/docs/subscriptions) with narrow criteria and appropriate interaction or transition filters         |
| An external service sends an event             | A [webhook handler](/docs/bots/consuming-webhooks), including the service's authentication or signature verification |
| A scheduled time arrives                       | A [Cron schedule](/docs/bots/bot-cron-job)                                                                           |

Manage trigger configuration with the release. Verify its target Bot, execution identity, and environment-specific settings. Enable it after deployment and configuration checks. Repeated delivery, manual replay, and a timeout after an external service accepted a request all need a defined recovery behavior; do not assume that every invocation happens exactly once.

## Configure Bot logging {#configuring-bot-logging}

Choose the evidence operators need for successful work and for failure investigation.

### Choose which runs to record {#logging-triggers}

`Bot.auditEventTrigger` selects which runs produce execution audit events: `always`, `never`, `on-error`, or `on-output`.

### Choose where events are stored {#logging-destination}

Events that pass the trigger filter are sent to the server's audit logger and, by default, stored as FHIR resources. The `Bot.auditEventDestination` array controls resource storage; server configuration controls whether audit logs are emitted. See [Monitoring Bots](/docs/bots/monitoring-bots) for these settings and the Event tab.

Log the workflow stage and correlation identifiers needed to find the associated records. Avoid logging whole clinical payloads or secrets. Confirm that the people responsible for operations can access the selected log destination.

## Recover failed work

Use the [monitoring and recovery guide](/docs/bots/monitoring-bots) to distinguish a missing trigger, an invocation failure, and a partially completed business operation.

For a code regression, redeploy a retained, known-good artifact and verify its compatibility with current resource shapes and integration configuration.

{{< warning title="Reconcile side effects before replaying" >}}
Code rollback does not reverse FHIR writes or external actions. Check what already succeeded before replaying an item, and use the same business idempotency key when the integration supports it.
{{< /warning >}}

Keep the recovery procedure beside the Bot's source: how to pause new work, locate failed inputs, determine what already succeeded, replay selected items, and confirm completion.

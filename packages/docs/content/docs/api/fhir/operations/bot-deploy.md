---
id: bot-deploy
title: Bot $deploy
---

The `$deploy` operation uploads and activates Bot code on the Medplum server. This is essential for making your automation logic available for
execution by subscriptions, manual invocation, or scheduled tasks.

Deploying bots allows you to version and update your server-side automation without downtime, making it a critical operation for maintaining
healthcare workflows in production environments.

## Use Cases

- **CI/CD Pipelines**: Automatically deploy bot updates as part of your continuous deployment workflow
- **Development Iteration**: Quickly test code changes by deploying updated bot logic during development
- **Production Updates**: Roll out new features or bug fixes to production bots with minimal disruption
- **Multi-Environment Management**: Deploy different bot versions across staging and production environments

{{< tip >}}
If you're not familiar with Medplum Bots, you may want to review the [Bot Basics documentation](/docs/bots/bot-basics) first.
{{< /tip >}}

## Invoke `$deploy` Operation

To use the `$deploy` operation, you will need to make a `POST` request with the Bot's `id`. Additionally, the `$deploy` operation takes two body parameters:

1. `filename`: The name of the file the bot is stored in. If left blank, it will default to `index.js`.
2. `code`: The bot's code that will be executed when it is run.

{{< tabs groupId="language" >}}
  {{< tab value="ts" label="Typescript" >}}
{{< code-example file="packages/examples/src/api/fhir/operations/bot-deploy.ts" language="ts" blocks="deployTs" >}}
  {{< /tab >}}
  {{< tab value="cli" label="CLI" >}}
{{< code-example file="packages/examples/src/api/fhir/operations/bot-deploy.ts" language="bash" blocks="deployCli" >}}
  {{< /tab >}}
  {{< tab value="curl" label="cURL" >}}
{{< code-example file="packages/examples/src/api/fhir/operations/bot-deploy.ts" language="bash" blocks="deployCurl" >}}
  {{< /tab >}}
{{< /tabs >}}

## Related

- [Bot $execute](/docs/api/fhir/operations/bot-execute) - Execute a deployed bot
- [Bots In Production](/docs/bots/bots-in-production#deploying-your-bot) - Deployment best practices and CI/CD setup
- [Bot Basics](/docs/bots/bot-basics) - Introduction to Medplum Bots
- [Medplum CLI](/docs/cli) - Command-line tool for bot deployment
- [FHIR Bot Resource](https://www.medplum.com/docs/api/fhir/medplum/bot) - Medplum Bot resource reference

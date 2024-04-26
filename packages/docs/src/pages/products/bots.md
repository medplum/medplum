# Automation through Bots

Automation, and the ability to build highly automated, custom workflows is one of the primary use-cases of Medplum. Medplum automations are implemented via [bots](/docs/bots), which are lambdas that implement custom functions written by developers.

Bots are often linked with integrations and are one of the most utilized features of Medplum.

## Examples

To get a sense of what bots are, it's useful to consider some examples. Below are examples of automations built using the [bots](/docs/bots) framework.

- **Consume event data or webhooks from other platforms**: see this tutorial on [consuming HL7 feeds and converting to FHIR](/docs/bots/hl7-into-fhir).
- **Export data to other systems**: see this tutorial on [exporting a PDF report for human consumption](/docs/bots/creating-a-pdf).
- **Drive workflow**: see this tutorial on checking insurance eligibility for a specific medical service.
- **Calling out to 3rd party APIs**: see this tutorial on [uploading a file to an external API](/docs/bots/file-uploads).

## Writing Bots

Bots are written in TypeScript using the Medplum [SDK](/docs/sdk). Bots are then deployed into and hosted as part of the core application, much like AWS Lambdas. When the bot is invoked the bot code is executed.

- The bots active in your account can be viewed in on [app.medplum.com](https://app.medplum.com/Bot)
- Tutorials on how to write bots can be found [here](/docs/bots)
- Reference implementations of common bots can be found [here](https://github.com/medplum/medplum-demo-bots)
- Command Line Interface (CLI) documentation for testing and deploying bots can be found [here](/docs/bots/bots-in-production)

## Triggering Bots

Bots can be triggered the following ways:

- **Via subscription**: [subscriptions](/docs/bots/bot-basics#executing-automatically-using-a-subscription) are webhooks that are triggered when FHIR resources are created or updated and can trigger bots.
- **POST to $execute endpoint**: each bot exposes an API endpoint and a POST to that endpoint will trigger the bot.
- **Via Questionnaire**: you can link a questionnaire to a bot and when the questionnaire is filled out, the bot can [process the response](/docs/bots/bot-for-questionnaire-response).

A detailed guide on these scenarios can be found in our [bots tutorials](/docs/bots/bot-basics#executing-a-bot).

## FHIR Resources

| Resource              | App Link                                                  | Create New                                              | API Documentation                                     |
| --------------------- | --------------------------------------------------------- | ------------------------------------------------------- | ----------------------------------------------------- |
| Bot                   | [View All](https://app.medplum.com/Bot)                   | [Create New](https://app.medplum.com/Bot/new)           | [CLI](/docs/bots/bots-in-production)                  |
| Subscription          | [View All](https://app.medplum.com/Subscription)          | [Create New](https://app.medplum.com/Subscription/new)  | [API](/docs/api/fhir/resources/subscription)          |
| Questionnaire         | [View All](https://app.medplum.com/Questionnaire)         | [Create New](https://app.medplum.com/Questionnaire/new) | [API](/docs/api/fhir/resources/questionnaire)         |
| QuestionnaireResponse | [View All](https://app.medplum.com/QuestionnaireResponse) | Created programmatically                                | [API](/docs/api/fhir/resources/questionnaireresponse) |
| AuditEvent            | [View All](https://app.medplum.com/AuditEvent)            | Created automatically                                   | [API](/docs/api/fhir/resources/auditevent)            |

## System Diagram

This diagram shows how bots fit into the overall system architecture.

![Medplum system overview](/img/medplum-overview.svg)

## Demos and Reference Material

- [Bot Tutorials](/docs/bots)
- [Subscriptions](/docs/subscriptions) - these are like webhooks
- [Sample Bot Repository](https://github.com/medplum/medplum-demo-bots) on Github
- [Bots](https://app.medplum.com/admin/bots) in the admin panel
- [Secrets](https://app.medplum.com/admin/secrets) in the admin panel
- [Bot Commits](https://github.com/medplum/medplum/search?q=Bot&type=commits) on Github
- [Example Bot in Mock Library](https://github.com/medplum/medplum/blob/main/packages/mock/src/mocks/bot.ts)

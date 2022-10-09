# Automation

Automation, and the ability to build highly automated, custom workflows is one of the primary use-cases of Medplum. Medplum automations are implemented via the [bots](https://www.medplum.com/docs/tutorials/bots), which are lambdas that implement custom functions written by developers.

Bots are often, but not always, linked with integrations and are one of the most utilized features of Medplum.

## Examples

To get a sense of what bots are, it's useful to consider some examples. Below are examples of automations built using the [bots](https://www.medplum.com/docs/tutorials/bots) framework.

- **Consume event data or webhooks from other platforms**: see this tutorial on [Consuming HL7 Feeds and Converting to FHIR](https://www.medplum.com/docs/tutorials/bots/hl7-into-fhir).
- **Export data to other systems**: see this tutorial on [Exporting a PDF Report for human consumption](https://www.medplum.com/docs/tutorials/bots/creating-a-pdf).
- **Drive workflow**: see this tutorial on [Checking Insurance Eligibility for a specific medical service](https://www.medplum.com/docs/tutorials/bots/insurance-eligibility-check).

## Writing Bots

Bots are written in TypeScript using the Medplum [SDK](https://www.medplum.com/docs/sdk). Bots are then deployed into and hosted as part of the core application, much like AWS Lambdas. When the bot is invoked the bot code is executed.

- The bots active in your account can be viewed in on [app.medplum.com](https://app.medplum.com/Bot)
- Tutorials on how to write bots can be found [here](https://www.medplum.com/docs/tutorials/bots/hl7-into-fhir)
- Reference implementations of common bots can be found [here](https://github.com/medplum/medplum-demo-bots)
- Command Line Interface (CLI) documentation for testing and deploying bots can be found [here](https://www.medplum.com/docs/tutorials/bots/bots-in-production)

## Triggering Bots

Bots can be triggered the following ways:

- **Via subscription**: [subscriptions](https://www.medplum.com/docs/tutorials/api-basics/publish-and-subscribe) are webhooks that are triggered when FHIR resources are created or updated and can trigger bots.
- **POST to $execute endpoint**: each bot exposes an API endpoint and a POST to that endpoint will trigger the bot.
- **Via Questionnaire**: you can link a questionnaire to a bot and when the questionnaire is filled out, the bot can [process the response](https://www.medplum.com/docs/tutorials/bots/bot-for-questionnaire-response).

A detailed guide on these scenarios can be found in our [bots tutorials](https://www.medplum.com/docs/tutorials/bots/bot-basics#executing-a-bot).

## FHIR Resources

| Resource              | App Link                                                  | Create New                                              | API Documentation                                                            |
| --------------------- | --------------------------------------------------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Bot                   | [View All](https://app.medplum.com/Bot)                   | [Create New](https://app.medplum.com/Bot/new)           | [CLI](https://www.medplum.com/docs/tutorials/bots/bots-in-production)        |
| Subscription          | [View All](https://app.medplum.com/Subscription)          | [Create New](https://app.medplum.com/Subscription/new)  | [API](https://www.medplum.com/docs/api/fhir/resources/subscription)          |
| Questionnaire         | [View All](https://app.medplum.com/Questionnaire)         | [Create New](https://app.medplum.com/Questionnaire/new) | [API](https://www.medplum.com/docs/api/fhir/resources/questionnaire)         |
| QuestionnaireResponse | [View All](https://app.medplum.com/QuestionnaireResponse) | Created programmatically                                | [API](https://www.medplum.com/docs/api/fhir/resources/questionnaireresponse) |
| AuditEvent            | [View All](https://app.medplum.com/AuditEvent)            | Created automatically                                   | [API](https://www.medplum.com/docs/api/fhir/resources/auditevent)            |

## System Diagram

![System Diagram](https://www.medplum.com/assets/images/medplum-overview-c4c72ac1fe276023aea0954dc75140c4.svg)

## Demos and Reference Material

- [Bot Tutorials](https://www.medplum.com/docs/tutorials/bots)
- [Publish and Subscribe](https://www.medplum.com/docs/tutorials/api-basics/publish-and-subscribe)
- [Sample Bot Repository](https://github.com/medplum/medplum-demo-bots) on Github
- [Bots](https://app.medplum.com/admin/bots) in the admin panel
- [Secrets](https://app.medplum.com/admin/secrets) in the admin panel
- [Bot Commits](https://github.com/medplum/medplum/search?q=Bot&type=commits) on Github

---
sidebar_position: 0
---

# Bots

Medplum bots are functions that execute when triggered. They are similar to AWS Lambda functions, and in Medplum we make them easy to write and deploy and trigger with [FHIR Subscriptions](/docs/subscriptions). For the purpose of the tutorials found in this section, it's important to understand that **Bots drive many of the major integrations that you see in Medplum**.

If you are new to Medplum Bots, we encourage you to read the intro material in the [**Bot Guide**](/docs/bots/bot-basics).

The following tutorials will walk through some of the use cases for Bots, to give you a sense of how they can work for you.

:::warning Enabling Bots

Bots are a [project level setting](/docs/access/projects#settings) that must be enabled by a Super Admin user.

For users on the [Medplum Hosted Service](/pricing), bots are a paid features. Contact info@medplum.com or reach out in our [Discord channel](https://discord.gg/medplum) to have Bots enabled on your project.

Super administrators can enable bots via the Medplum App:

- Navigate to https://app.your-medplum-domain.com/Project/:projectId
- Click on the "Edit" tab
- In the "Features" section, add an entry with the value "bots"

:::

## Getting Started
Learn the fundamentals of building and testing bots before deploying them to production.
- [Bot Basics](/docs/bots/bot-basics)
- [Unit Testing Bots](/docs/bots/unit-testing-bots)
- [Running Bots Locally](/docs/bots/running-bots-locally)

## Bot Triggers & Invocation
Configure how and when your bots execute, from scheduled tasks to real-time event responses.
- [Cron Jobs for Bots](/docs/bots/bot-cron-job)
- [Consuming Webhooks](/docs/bots/consuming-webhooks)
- [Bot for QuestionnaireResponse](/docs/bots/bot-for-questionnaire-response)
- [Custom FHIR Operations](/docs/bots/custom-fhir-operations)

## Common Use Cases & Patterns
Implement frequently-needed functionality like file handling, document generation, and data transformation.
- [Uploading Files](/docs/bots/file-uploads)
- [Create a PDF](/docs/bots/creating-a-pdf)
- [HL7 to FHIR](/docs/bots/hl7-into-fhir)

## Deployment & Infrastructure
Deploy your bots to Medplum's cloud infrastructure or integrate with your existing AWS environment.
- [Bots in Production](/docs/bots/bots-in-production)
- [Running Bots on Fission](/docs/bots/running-bots-on-fission)
- [External Lambda Functions](/docs/bots/external-function)
- [Medplum Bot Layers](/docs/bots/bot-lambda-layer)

## Security & Permissions
Manage sensitive credentials and control what actions your bots can perform.
- [Bot Secrets](/docs/bots/bot-secrets)
- [Run as User](/docs/bots/bot-run-as-user)

## Monitoring & Operations
Track bot performance and troubleshoot issues in production environments.
- [Monitoring Bots](/docs/bots/monitoring-bots)

## Reference

- [Demo Bots Repository](https://github.com/medplum/medplum-demo-bots) on Github
- [Bot Features and Fixes](https://github.com/medplum/medplum/pulls?q=is%3Apr+label%3Abots) on Github

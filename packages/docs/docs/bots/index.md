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

## Consume event data or webhooks from other platforms

1. [Consuming Webhooks](/docs/bots/consuming-webhooks)
2. [Consuming HL7 Feeds and Converting to FHIR](/docs/bots/hl7-into-fhir)
3. Coming Soon: Consuming Lab Results from a lab instrument or LIS
4. [Receive payment and accounts data](https://github.com/medplum/medplum-demo-bots/tree/main/src/stripe-bots)

## Export data to other systems

1. [Exporting data to a billing service](https://github.com/medplum/medplum-demo-bots/tree/main/src/candid-health)
2. [Exporting a PDF Report for human consumption](/docs/bots/creating-a-pdf)
3. [File Uploads](/docs/bots/file-uploads)

## Drive workflow

1. Checking Insurance Eligibility for a specific medical service
2. Coming Soon: Order Medication through an Online Pharmacy
3. Data automation driven by [FHIR Questionnaires](/docs/bots/bot-for-questionnaire-response)
4. Coming Soon: Send email notifications when critical lab values are received

## Ensure correctness

1. Coming Soon: Verifying that all Lab Results are present on a DiagnosticReport before sending it for physician review

## Reference

- [Demo Bots Repository](https://github.com/medplum/medplum-demo-bots) on Github
- [Bot Features and Fixes](https://github.com/medplum/medplum/pulls?q=is%3Apr+label%3Abots) on Github

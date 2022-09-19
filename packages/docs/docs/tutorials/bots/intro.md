---
sidebar_position: 0
slug: /tutorials/bots
---

# Intro

If you have never heard of Medplum Bots, we encourage you to read the intro material in the [**Bot Guide**](./bots/bot-basics).

Medplum bots are functions that execute when triggered. They are similar to AWS Lambda functions, and in Medplum we make them easy to write and deploy and trigger with [FHIR Subscriptions](./api-basics/publish-and-subscribe). For the purpose of the tutorials found in this section, it's important to understand that **Bots drive many of the major integrations that you see in Medplum**.

The following tutorials will walk through some of the use cases for Bots, to give you a sense of how they can work for you.

## Consume event data or webhooks from other platforms

1. [Integrating Logistics (3PL) into your EHR](./bots/logistics-into-ehr)
2. [Consuming HL7 Feeds and Converting to FHIR](./bots/insurance-eligibility-check)
3. Coming Soon: Consuming Lab Results from a lab instrument or LIS

## Export data to other systems

1. Coming Soon: Exporting data to a billing service
2. Coming Soon: Exporting a PDF Report for human consumption

## Drive workflow

1. Coming Soon: Checking Insurance Eligibility for a specific medical service
2. Coming Soon: Order Medication through an Online Pharmacy
3. Coming Soon: Creating and FHIR Objects on Questionnaire submissions
4. Coming Soon: Send email notifications when critical lab values are received

## Ensure correctness

1. Coming Soon: Verifying that all Lab Results are present on a DiagnosticReport before sending it for physician review

If you need any of these guides immediately, please contact us at info@medplum.com.

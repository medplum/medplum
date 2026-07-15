---
sidebar_position: 0
tags: [integration, communications]
---

# Twilio SMS Integration

Medplum provides a first-party integration with Twilio to send and receive SMS messages directly from your healthcare application. Messages are stored as FHIR `Communication` resources, enabling seamless integration with your clinical workflows.

:::caution[Hosted Medplum Only]
This integration is available on hosted Medplum only and requires setup by the Medplum team. It is not available for self-hosted deployments. [Contact us](mailto:info@medplum.com?subject=Twilio%20SMS%20Integration) to enable Twilio SMS for your project.
:::

## Overview

The Twilio SMS integration allows you to:

- **Send outbound SMS** from FHIR `Communication` resources via the `$send-sms-twilio` operation
- **Receive inbound SMS** and store them as `Communication` resources via a Twilio webhook
- **Register inbound webhooks** for one or more Twilio phone numbers via `$twilio-sms-register-inbound`
- **Test connectivity** to verify your Twilio credentials via `$test-twilio-connection`

## Prerequisites

- A Medplum project with the Twilio SMS integration enabled
- A Twilio account with at least one SMS-capable phone number
- Your Twilio Account SID and Auth Token

## Getting Started

| Guide | Description |
|---|---|
| [Setup](/docs/integration/twilio-sms/setup) | Install the integration and configure your Twilio credentials |
| [Sending SMS](/docs/integration/twilio-sms/sending-sms) | Send outbound SMS via the `$send-sms-twilio` operation |
| [Receiving SMS](/docs/integration/twilio-sms/receiving-sms) | Receive inbound messages and track delivery status |
| [Threading](/docs/integration/twilio-sms/threading) | Organize messages into conversation threads |

# Encounter Follow-up Email Bot

An automated bot that sends follow-up emails to patients after their encounters are finished.

## Overview

This bot monitors FHIR Encounter resources and automatically sends personalized follow-up emails to patients when an encounter status changes to "finished".

## Prerequisites

- **Email Feature Flag**: The Medplum project must have the email feature flag enabled to allow bots to send emails
- Patient must have an email address in their telecom information
- Encounter must have a subject (patient) reference

## Usage

### Setup

1. **Deploy the Bot**: Upload the bot code to your Medplum server
2. **Create Subscription**: Use the provided `encounter-follow-up-email-subscription.json` to create a FHIR Subscription
3. **Configure Bot ID**: Update the subscription JSON file with your bot's ID in the endpoint URL

### How It Works

The bot is triggered automatically when an Encounter resource is updated to status "finished". The subscription monitors for:

- **Criteria**: `Encounter?status=finished`
- **Trigger**: Any encounter status change to "finished"
- **Payload**: Full encounter resource sent to bot

### Requirements

- **Patient Email**: Patients must have email addresses in their telecom information
- **Encounter Data**: Encounters must have:
  - Subject (patient) reference
  - Participant with provider information
  - Period with start date

### Email Template

The bot sends HTML emails containing:

- Personalized greeting with patient name
- Provider name and appointment date
- Link to view visit summary
- Link to schedule follow-up appointments

### Testing

Run the test suite to verify bot functionality:

```bash
npm test encounter-follow-up-email-bot.test.ts
```

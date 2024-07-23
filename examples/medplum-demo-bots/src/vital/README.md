# Vital FHIR Integration Bots

The bots in this directory serve as a FHIR lab integration with Vital, a leading healthcare company. These bots interact with Vital's systems via a REST API using the FHIR format and can be automatically triggered by subscriptions and Vital webhooks.

For our purposes, we'll be focusing on two specific types of workflows: ordering and resulting.

- **Ordering**: This workflow is used by healthcare providers to place an order for a lab test or procedure with Vital.

- **Resulting**: This workflow is triggered by a webhook from Vital to transmit the results of a lab test or procedure back to the ordering provider.

## Overview of Bots

1. **order-create**: This bot sends a FHIR Order message to Vital using the REST API. It is triggered when a new `ServiceRequest` resource is created.

2. **order-result**: This bot retrieves results from a FHIR Result message from Vital using the REST API. It is triggered when a new Vital webhook is received.

## Settings

The bots require the following environment variables to be set:

- `VITAL_API_KEY`: The API key for the Vital REST API.
- `VITAL_API_URL`: The base URL for the Vital REST API. Defaults to `https://api.dev.tryvital.io`.

You can see a demo implementation [here](https://github.com/tryVital/medplum-demo)

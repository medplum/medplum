# Candid and Medplum

[Candid Health](https://joincandidhealth.com/) enables streamlined medical insurance billing and is straightforward to use with Medplum. Well maintained and annotated FHIR resources can be used to build a custom, automated and high fidelity workflow.

## Background

A reliable billing workflow based on FHIR is based on creation of the `Patient`, `Encounter` and `Coverage` resources on an event driven basis, and maintaining `Organization` and `Practitioner` resources with the correct metadata such as addresses and NPI numbers.

Automation entails writing a bot that automatically captures and validates the data as it is collected.

[FHIR Resources Documentation](https://www.medplum.com/docs/api/fhir/resources) is available on medplum.com.

## Example

The `send-to-candid.test.ts` is a test that repo illustrates how to construct resources so that they are appropriately annotated.

## Synchronizing data to Candid

The `send-to-candid.ts` bot demonstrates how to construct a coded encounter to the Candid API, populated with the appropriate metadata. Constructing the coded encounter is highly business logic dependent and may need adjustment or enhancement based on the service provided.

## Task Synchronizer

The `sync-candid-tasks.ts` bot demonstrates how to pull tasks from Candid and synchronize them to Medplum. The Tasks API is polling based, so it is recommended that you run this [bot on cron](https://www.medplum.com/docs/bots/bot-cron-job) to synchronize the tasks at a regular interval.

The example shows syncing open tasks, and syncing by status and time window is a best practice.

## Other features

- Claims and payor related data are also possible to build and maintain in FHIR, and can be useful for many payor-to-payor and payor-to-provider integrations. You can see common payor FHIR implementation guide on the [Medplum Compliance](https://www.medplum.com/docs/compliance/cms-fhir) documentation.

---
sidebar_position: 2
tags: [integration]
---

# Connecting to External FHIR Servers

:::caution
CLI connections to external FHIR servers is in Beta. Please join us on [Discord](https://discord.gg/medplum) with questions or email [hello@medplum.com](mailto:hello@medplum.com).
:::

When building an application, you many need to query or write data to an external FHIR server as part of your application's workflow. For example:

- When a new patient is created, see if that patient already exists in another server
- When an encounter is finalized, synchronize the encounter documentation to another FHIR server
- On a bi-weekly basis, pull new FHIR data from a partner using a Bulk FHIR API

To enable these scenarios, you will need a `clientId` or `clientSecret` to access the system you want to connect to. Please note that different systems have different levels of functionality, and so the commands in the CLI are not guaranteed to work.

The examples below use the [CLI optional flags](/docs/cli#optional-flags).

## Example: Basic search

In this example, we will show how to search for a patient by identifier using the command line.

```bash
medplum get 'Patient?identifier:contains=3SH0A00AA00' --base-url <base-url> --fhir-url-path <fhir-url-path> --token-url <token-url> --client-id <client-id> --client-secret <client-secret>
```

## Example: Create encounter

In this example, an Encounter is created in another system using the command line.

```bash
medplum post Encounter '{"resourceType": "Encounter", "status": "finished", "class": {"system": "http://terminology.hl7.org/CodeSystem/v3-ActCode", "code": "AMB"}, "type": [{"coding": [{"system": "http://snomed.info/sct", "code": "162673000", "display": "General examination of patient (procedure)"}], "text": "General examination of patient (procedure)"}], "subject": {"reference": "Patient/13e44a47-636b-49e2-adb3-9f19c7e0e47a", "display": "Mr. Dustin31 Ritchie586"}}' --base-url <base-url> --fhir-url-path <fhir-url-path> --token-url <token-url> --client-id <client-id> --client-secret <client-secret>
```

## Example: Bulk FHIR Export

In this example, Bulk FHIR ndjson files are exported from the server and stored on on the local drive.

```bash
medplum bulk export -e Group/all --base-url <base-url> --fhir-url-path <fhir-url-path> --token-url <token-url> --client-id <client-id> --client-secret <client-secret>
```

For example, [CMS BCDA](https://bcda.cms.gov/) publishes a Bulk FHIR test server. You can get [test credentials here](https://bcda.cms.gov/guide.html#try-the-api) and try the following command.

```bash
medplum bulk export -e Group/all --base-url https://sandbox.bcda.cms.gov --fhir-url-path api/v2/ --token-url https://sandbox.bcda.cms.gov/auth/token --client-id <client-id> --client-secret <client-secret>
```

## Next Steps

The Medplum CLI uses Medplum [TypescriptSDK](/docs/sdk) to power the functionality. Once the external connection is working and you have tested some of the basic scenarios, it is recommended to build out your integration as a [bot](docs/bots) to enable your event driven or [cron-based](/docs/bots/bot-cron-job) workflow.

## Related Resources

- [Epic FHIR Test Environment](https://fhir.epic.com/Developer/Apps)
- [eCLinicalworks FHIR documentation](https://fhir.eclinicalworks.com/ecwopendev/documentation#)
- [Cerner FHIR Documentation](https://fhir.cerner.com/millennium/r4/#open-sandbox)
- [Health Gorilla FHIR Documentation](https://developer.healthgorilla.com/docs/oauth20)

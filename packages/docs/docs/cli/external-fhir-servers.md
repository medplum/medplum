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

The examples below use the [CLI optional flags](/docs/cli#optional-flags-for-medplum-commands).

## Setting up your credentials

Medplum CLI stores credentials to be used in a future period without needing it to be entered in every command. By using the `profile` command, this helps with the ability to work with multiple FHIR servers.

### Setting a Profile

In this example, we will set up a profile using `medplum profile set <profileName>` with the flags below:

- --auth-type
- --client-id
- --client-secret
- --base-url
- --token-url
- --authorize-url
- --fhir-url-path

### Syntax

```bash
medplum profile set <profileName> \
    --auth-type <auth-type> \
    --base-url <base-url> \
    --fhir-url-path <fhir-url-path> \
    --token-url <token-url> \
    --client-id <client-id> \
    --client-secret <client-secret>
```

| Accepted Auth Type |
| ------------------ |
| basic              |
| client-credentials |
| authorization-code |
| jwt-bearer         |

The profile will now be stored in a file directory in `~.medplum/<profileName>.json`

Once you have a profile, you can connect with external FHIR servers with your profile using the `-p` flag.

### Example: Basic Auth

```bash
medplum profile set example \
    --auth-type "basic" \
    --base-url "https://api.example.com" \
    --fhir-url-path "fhir/R4" \
    --client-id "MY_CLIENT_ID" \
    --client-secret "MY_CLIENT_SECRET"
```

### Example: JWT Bearer

```bash
medplum profile set example \
    --auth-type "jwt-bearer" \
    --base-url "https://api.example.com" \
    --fhir-url-path "fhir/R4" \
    --token-url "/oauth2/token" \
    --client-id "MY_CLIENT_ID" \
    --client-secret "MY_CLIENT_SECRET"
    --scope "openid profile"
    --audience "/oauth2/token"
    --subject "john_doe"
    --issuer "api.example.com"
```

### Example: JWT Assertion

```bash
medplum profile set example \
    --auth-type "jwt-assertion" \
    --base-url "https://api.example.com" \
    --fhir-url-path "fhir/R4" \
    --token-url "/oauth2/token" \
    --client-id "MY_CLIENT_ID" \
    --audience "/oauth2/token" \
    --subject "john_doe" \
    --private-key-path "/path/to/privatekey.pem"
```

:::note

If you are authenticating with Epic and it returns `\{"error":"invalid_client","error_description":null\}`, here is a [Doc to Troubleshoot](https://fhir.epic.com/Resources/jwt_auth_troubleshoot_eof).

:::

### Example: Client Credentials

```bash
medplum profile set example \
    --auth-type "client-credentials" \
    --base-url "https://api.example.com" \
    --fhir-url-path "fhir/R4" \
    --token-url "oauth2/token" \
    --client-id "MY_CLIENT_ID" \
    --client-secret "MY_CLIENT_SECRET"
```

### Example: User Login / Authorization Code

```bash
medplum profile set example \
    --base-url "https://api.example.com" \
    --fhir-url-path "fhir/R4" \
    --authorize-url "oauth2/authorize" \
    --token-url "oauth2/token"
```

Other profile commands include:

#### `describe`

To see the state of your credentials in on profile

###### Syntax

```bash
medplum profile describe example
```

###### Example

```bash
medplum profile describe <profileName>
```

#### `remove`

Removing a profile

###### Syntax

```bash
medplum profile remove <profileName>
```

###### Example

```bash
medplum profile remove example
```

#### `list`

To see all of your profiles

```bash
medplum profile list
```

After your profiles are set, you can login with your credentials and use them on future commands. To login:

`medplum login --profile <profile>`

For more information take a look at our [CLI login](/docs/cli#auth)

## Logging in with a new Profile

You can run `medplum login --profile <profile>` and set the same flags that [profile](/docs/cli/external-fhir-servers#setting-a-profile) has to set a profile and automatically login

### Example: Logging in with JWT Bearer

```bash
medplum login \
    --profile "example" \
    --auth-type "jwt-bearer" \
    --base-url "https://api.example.com" \
    --fhir-url-path "fhir/R4" \
    --token-url "/oauth2/token" \
    --client-id "MY_CLIENT_ID" \
    --client-secret "MY_CLIENT_SECRET"
    --scope "openid profile"
    --audience "/oauth2/token"
    --subject "john_doe"
    --issuer "api.example.com"
```

:::note
When running `medplum login --profile <profile>`, all of the flags need to be set with the flags and valid data
:::

## Example: Basic search

In this example, we will show how to search for a patient by identifier using the command line after a profile has been set.

```bash
medplum get -p <profileName> 'Patient?identifier:contains=3SH0A00AA00'
```

## Example: Create encounter

In this example, an Encounter is created in another system using the command line after a profile has been set.

```bash
medplum post -p <profileName>  Encounter '{"resourceType": "Encounter", "status": "finished", "class": {"system": "http://terminology.hl7.org/CodeSystem/v3-ActCode", "code": "AMB"}, "type": [{"coding": [{"system": "http://snomed.info/sct", "code": "162673000", "display": "General examination of patient (procedure)"}], "text": "General examination of patient (procedure)"}], "subject": {"reference": "Patient/13e44a47-636b-49e2-adb3-9f19c7e0e47a", "display": "Mr. Dustin31 Ritchie586"}}'
```

## Example: Bulk FHIR Export

In this example, Bulk FHIR ndjson files are exported from the server and stored on on the local drive after a profile has been set.

```bash
medplum bulk export -p <profileName> -e Group/all
```

For example, [CMS BCDA](https://bcda.cms.gov/) publishes a Bulk FHIR test server. You can store [test credentials here](https://bcda.cms.gov/guide.html#try-the-api) in a profile and try the following command.

```bash
medplum profile set bcda-sandbox --base-url https://sandbox.bcda.cms.gov --fhir-url-path api/v2/ --token-url https://sandbox.bcda.cms.gov/auth/token --client-id <client-id> --client-secret <client-secret>
```

And then run

```bash
medplum bulk export -p bcda-sandbox -e Group/all
```

## Next Steps

The Medplum CLI uses Medplum [TypescriptSDK](/docs/sdk) to power the functionality. Once the external connection is working and you have tested some of the basic scenarios, it is recommended to build out your integration as a [bot](/docs/bots) to enable your event driven or [cron-based](/docs/bots/bot-cron-job) workflow.

## Related Resources

- [Epic FHIR Test Environment](https://fhir.epic.com/Developer/Apps)
- [eClinicalworks FHIR documentation](https://fhir.eclinicalworks.com/ecwopendev/documentation#)
- [Cerner FHIR Documentation](https://fhir.cerner.com/millennium/r4/#open-sandbox)
- [Health Gorilla FHIR Documentation](https://developer.healthgorilla.com/docs/oauth20)

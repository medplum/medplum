---
sidebar_position: 5
---

# Agent Access Policy

This guide covers the minimal access policy configuration required for the Medplum Agent, including how to use parameterized policies for multi-organization deployments.

## Minimal Access Policy

The following `AccessPolicy` provides the bare minimum permissions needed to start the agent and invoke a simple Bot that doesn't create any resources:

```json
{
  "resourceType": "AccessPolicy",
  "name": "Minimal Agent Access Policy",
  "resource": [
    {
      "resourceType": "Endpoint",
      "readonly": true
    },
    {
      "resourceType": "Agent",
      "readonly": true
    },
    {
      "resourceType": "Bot",
      "readonly": true
    },
    {
      "resourceType": "CodeSystem",
      "readonly": true
    },
    {
      "resourceType": "ValueSet",
      "readonly": true
    }
  ]
}
```

This policy grants read-only access to:

- **Endpoint**: Required to read the channel endpoint configurations
- **Agent**: Required to read the agent configuration itself
- **Bot**: Required to read and invoke bots defined in the agent channels
- **CodeSystem** and **ValueSet**: Required for terminology operations that bots may use

## Parameterized Access Policy

For deployments with multiple organizations, you can use a [parameterized access policy](/docs/access/access-policies#parameterized-policies) to share a single policy across all `ClientApplication` resources. This uses the `%org` variable to scope resources to the appropriate organization:

```json
{
  "resourceType": "AccessPolicy",
  "name": "Minimal Agent Access Policy",
  "resource": [
    {
      "resourceType": "Endpoint",
      "readonly": true,
      "criteria": "Endpoint?_compartment=%org"
    },
    {
      "resourceType": "Agent",
      "readonly": true,
      "criteria": "Agent?_compartment=%org"
    },
    {
      "resourceType": "Bot",
      "readonly": true,
      "criteria": "Bot?_compartment=%org"
    },
    {
      "resourceType": "CodeSystem",
      "readonly": true
    },
    {
      "resourceType": "ValueSet",
      "readonly": true
    }
  ]
}
```

## Adding Bot Resource Permissions

Bot invocations inherit permissions from the invoking `ClientApplication`. You must add entries to the access policy for any resource types that your bots need to read or write.

For example, if your bot creates `Patient` resources as part of its workflow, add read/write access:

```json
{
  "resourceType": "AccessPolicy",
  "name": "Minimal Agent Access Policy",
  "resource": [
    {
      "resourceType": "Endpoint",
      "readonly": true,
      "criteria": "Endpoint?_compartment=%org"
    },
    {
      "resourceType": "Agent",
      "readonly": true,
      "criteria": "Agent?_compartment=%org"
    },
    {
      "resourceType": "Bot",
      "readonly": true,
      "criteria": "Bot?_compartment=%org"
    },
    {
      "resourceType": "CodeSystem",
      "readonly": true
    },
    {
      "resourceType": "ValueSet",
      "readonly": true
    },
    {
      "resourceType": "Patient",
      "criteria": "Patient?_compartment=%org"
    }
  ]
}
```

## Using Compartments for Resource Tagging

You can add a top-level `compartment` to the access policy to automatically tag all resources created by the bot with the appropriate organization. This ensures that resources are forced into the correct compartment:

```json
{
  "resourceType": "AccessPolicy",
  "name": "Minimal Agent Access Policy",
  "compartment": {
    "reference": "%org"
  },
  "resource": [
    {
      "resourceType": "Endpoint",
      "readonly": true,
      "criteria": "Endpoint?_compartment=%org"
    },
    {
      "resourceType": "Agent",
      "readonly": true,
      "criteria": "Agent?_compartment=%org"
    },
    {
      "resourceType": "Bot",
      "readonly": true,
      "criteria": "Bot?_compartment=%org"
    },
    {
      "resourceType": "CodeSystem",
      "readonly": true
    },
    {
      "resourceType": "ValueSet",
      "readonly": true
    },
    {
      "resourceType": "Patient",
      "criteria": "Patient?_compartment=%org"
    }
  ]
}
```

With this configuration, any `Patient` resources created by the bot will automatically have their `meta.account` set to the organization specified in the policy parameter.

## Configuring the ProjectMembership

To use a parameterized access policy, you must configure the `ProjectMembership` for the `ClientApplication` with the appropriate parameter values. The `org` parameter should reference the `Organization` resource that the agent belongs to:

```json
{
  "resourceType": "ProjectMembership",
  "access": [
    {
      "policy": {
        "reference": "AccessPolicy/your-access-policy-id",
        "display": "Minimal Agent Access Policy"
      },
      "parameter": [
        {
          "name": "org",
          "valueReference": {
            "reference": "Organization/your-organization-id",
            "display": "My Organization"
          }
        }
      ]
    }
  ]
}
```

This configuration allows you to:

1. Use the same `AccessPolicy` resource for all agent `ClientApplication` resources
2. Scope each agent's access to resources within its specific organization
3. Automatically tag resources created by bots with the correct organization compartment

## See Also

- [Access Policies](/docs/access/access-policies) - Full documentation on access policies
- [Parameterized Policies](/docs/access/access-policies#parameterized-policies) - Details on using variables in access policies
- [Intro to Medplum Agent](/docs/agent) - Agent setup and configuration

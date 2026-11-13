---
id: access-policy
title: Agent Access Policy
weight: 60
---

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

This example uses Organizations as access groups within one project. An organization can represent an application tenant or a narrower group; choose its role in [Tenancy Design](/docs/decision-guides/tenancy-design). Assign the resources to the intended organization using [tenant account assignments](/docs/access/multi-tenant-access-policy#step-2-assigning-data-to-tenants).

Use a [parameterized access policy](/docs/access/access-policies#parameterized-policies) to reuse the policy for each `ClientApplication`. The `%org` variable restricts access to resources assigned to the approved organization:

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

For example, to read and update Patients already assigned to the organization, add a Patient rule. Creating Patients also requires an assignment workflow, as described below:

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

An existing policy can use a top-level `compartment` to stamp an organization account on ordinary resource creation. This also applies a broad compartment restriction, so check its effect on shared reference data. For new designs, prefer resource-level criteria with a controlled [$set-accounts assignment workflow](/docs/api/fhir/operations/set-accounts); that operation requires project-admin or super-admin authority.

The following example illustrates the top-level pattern:

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

For ordinary Patient creation with this effective policy, the server includes the organization reference in `meta.accounts` and computes `meta.compartment`. Editing an existing Patient does not add the editor's organization. Clinical-resource writes can inherit the referenced Patient's accounts, so a shared Patient with separate clinical audiences needs [resource-specific rules](/docs/tenancy-design/patient-records#clinical-record-isolation).

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
3. Supply the organization for the configured assignment workflow

## See Also

- [Access Policies](/docs/access/access-policies) - Full documentation on access policies
- [Parameterized Policies](/docs/access/access-policies#parameterized-policies) - Details on using variables in access policies
- [Intro to Medplum Agent](/docs/agent) - Agent setup and configuration

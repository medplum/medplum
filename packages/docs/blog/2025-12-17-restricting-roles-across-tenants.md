---
slug: tenant-isolation-approaches-in-medplum
title: Tenant Isolation Approaches in Medplum
authors: finnbergquist
tags: [tenant, access-control, mso]
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Tenant Isolation Approaches in Medplum

In healthcare applications, practitioners often work across multiple organizational boundaries. A doctor might work at multiple clinics, a nurse might be part of several care teams, or a care coordinator might manage patients across different healthcare services. Each of these—clinics, care teams, and healthcare services—represents a distinct **tenant** in your system: a collection of resources (patients, observations, encounters, etc.) that should be logically grouped together.

In Medplum, you can build your tenancy model around any FHIR resource type. Common examples include:
- **`Organization`**: Different clinics, practices, or healthcare organizations
- **`HealthcareService`**: Different departments or services (e.g., Cardiology Department, Oncology Department)
- **`CareTeam`**: Different care teams (e.g., Diabetes Care Team, Hypertension Care Team)

For a comprehensive guide on how to set up multi-tenancy in Medplum—including data modeling, compartments, propagation, and user enrollment—see our [Multi-Tenant Access Control documentation](/docs/access/multi-tenant-access-policy).

This blog post focuses on a specific challenge: **What happens when a user belongs to multiple tenants?** And more importantly, **how can you ensure your application restricts access to only one tenant at a time?**

<!-- truncate -->

## Understanding API-Level Security and Isolation

Before diving into the solutions, it's important to understand what **API-level security and isolation** means, especially for non-technical readers.

When a user logs into your application, they receive an **authentication token** (think of it as a digital key). This token is used to make requests to the Medplum API server to read or modify patient data, medical records, and other healthcare information.

**API-level isolation** refers to security controls that are enforced by the Medplum server itself—not just by your application's user interface. When properly configured, the server checks every request against the user's permissions and only allows access to data the user is authorized to see.

### Why This Matters: The Security Risk

Here's the critical security concern: **If a bad actor obtains a user's authentication token and knows how to construct FHIR API requests, they could potentially access data from all tenants that user has access to—even if your application's UI only shows one tenant at a time.**

**The risks include:**

1. **Unauthorized Data Access**: An attacker with a stolen token could bypass your application's UI restrictions entirely and directly query the API to retrieve patient data from multiple tenants simultaneously.

2. **Data Exfiltration**: They could systematically extract sensitive health information (PHI) from all tenants the user belongs to, not just the one currently displayed in your application.

3. **Compliance Violations**: Accessing data across tenant boundaries could violate HIPAA, state privacy laws, or organizational policies that require strict data isolation between different clinics, departments, or care teams.

4. **Cross-Tenant Data Leakage**: Even if your UI correctly filters data, an attacker making direct API calls could discover relationships, patient overlaps, or other sensitive information that should remain isolated between tenants.

**The key question**: Does your security model rely solely on your application's UI to restrict access, or does the API server itself enforce single-tenant isolation?

This blog post explores different approaches to ensure that even if someone gets hold of an authentication token, the API server itself will restrict access to only one tenant's data at a time—providing true API-level security.

## How to Ensure Your Application Can Be Contained to Just One Tenant at a Time When a User Belongs to Multiple Tenants

### The Challenge: Multiple Tenant Memberships

When a Practitioner user belongs to multiple tenants, their `ProjectMembership` will have multiple entries in the `access` array, each with different tenant parameters:

**In this scenario, the user's API-level access includes data from both clinics. But how do you ensure your application is contained to just one tenant at a time?**

<Tabs groupId="tenant-type">
  <TabItem value="organization" label="Organization">

```json
{
  "resourceType": "ProjectMembership",
  "access": [
    {
      "parameter": [
        {
          "name": "organization",
          "valueReference": {
            "reference": "Organization/clinic-a",
            "display": "Downtown Clinic"
          }
        }
      ],
      "policy": {
        "reference": "AccessPolicy/mso-policy"
      }
    },
    {
      "parameter": [
        {
          "name": "organization",
          "valueReference": {
            "reference": "Organization/clinic-b",
            "display": "Uptown Clinic"
          }
        }
      ],
      "policy": {
        "reference": "AccessPolicy/mso-policy"
      }
    }
  ]
}
```

  </TabItem>
  <TabItem value="healthcare-service" label="HealthcareService">

```json
{
  "resourceType": "ProjectMembership",
  "access": [
    {
      "parameter": [
        {
          "name": "healthcare_service",
          "valueReference": {
            "reference": "HealthcareService/cardiology-service",
            "display": "Cardiology Department"
          }
        }
      ],
      "policy": {
        "reference": "AccessPolicy/service-policy"
      }
    },
    {
      "parameter": [
        {
          "name": "healthcare_service",
          "valueReference": {
            "reference": "HealthcareService/oncology-service",
            "display": "Oncology Department"
          }
        }
      ],
      "policy": {
        "reference": "AccessPolicy/service-policy"
      }
    }
  ]
}
```

  </TabItem>
  <TabItem value="careteam" label="CareTeam">

```json
{
  "resourceType": "ProjectMembership",
  "access": [
    {
      "parameter": [
        {
          "name": "care_team",
          "valueReference": {
            "reference": "CareTeam/diabetes-care-team",
            "display": "Diabetes Care Team"
          }
        }
      ],
      "policy": {
        "reference": "AccessPolicy/careteam-policy"
      }
    },
    {
      "parameter": [
        {
          "name": "care_team",
          "valueReference": {
            "reference": "CareTeam/hypertension-care-team",
            "display": "Hypertension Care Team"
          }
        }
      ],
      "policy": {
        "reference": "AccessPolicy/careteam-policy"
      }
    }
  ]
}
```

  </TabItem>
</Tabs>

## Tenant Isolation Approaches: Comparison Table

| Approach | API-Level Isolation (Enrolled Tenants) | API-Level Isolation (Per Tenant) | Application-Level Isolation | Use Case |
|----------|-------------------|-------------------|-------------------|----------|
| **[Option 1: All Tenants](#option-1-allow-access-to-all-enrolled-tenants)** | Yes | No | No | Cross-tenant visibility acceptable |
| **[Option 2: `_compartment` Parameter](#option-2-frontend-level-restriction-with-_compartment)** | Yes | No | Yes | Need UI-level tenant restriction acceptable, API level access to all enrolled tenants |
| **[Option 3: Multiple Memberships](#option-3-multiple-projectmemberships)** | Yes | Yes | Yes | Need strict API-level tenant isolation |

**Column Descriptions:**

- **API-Level Isolation (All Enrolled Tenants)**: Whether the API restricts access to only the tenants the user is enrolled in via their ProjectMembership.

- **API-Level Isolation (Per Tenant)**: Whether the API restricts a User's access to only one tenant at a time, even if the User is enrolled across multiple tenants.

- **Application-Level Isolation**: Whether the UI restricts what's displayed to a single tenant.

### Choosing the Right Approach

**Choose [Option 1](#option-1-allow-access-to-all-enrolled-tenants)** if cross-tenant visibility is acceptable and you want the simplest implementation.

**Choose [Option 2](#option-2-frontend-level-restriction-with-_compartment)** if you need UI-level tenant isolation but want users to be able to switch between tenants without re-authenticating. This approach maintains API-level access to all tenants and is also able to restrict what's displayed in the UI to only a single tenant at a time. It is much easier to implement [Option 2](#option-2-frontend-level-restriction-with-_compartment) than [Option 3](#option-3-multiple-projectmemberships). 

**Choose [Option 3](#option-3-multiple-projectmemberships)** if you need strict API-level single tenant access for security or compliance reasons. This is the most secure approach but requires users to sign in separately for each tenant they need to access with a separate ProjectMembership.


## Option 1: Allow Access to All Enrolled Tenants {#option-1-allow-access-to-all-enrolled-tenants}

**Description**: The user can view Patients and resources from all enrolled tenants simultaneously.

**Implementation**: No additional restrictions needed. The AccessPolicy already grants access to all enrolled tenants, and your application can display data from all tenants.

**Use Case**: This approach works well when cross-tenant visibility is acceptable or desired. *For example, a care coordinator who needs to see all patients across multiple clinics they manage.*


## Option 2: Frontend-Level Restriction with `_compartment`

**Description**: Keep the ProjectMembership and AccessPolicy configuration the same, but add the `_compartment` search parameter to all frontend queries to scope results to a specific tenant. The `_compartment` search parameter may look familiar because it is used in the AccessPolicy critertia. **We can also use `_compartment` on the query itself**, in combination with the AccessPolicy criteria, to further restrict the data that is returned to the user to only the data for the currently selected tenant.

**Implementation**: At the application level, maintain state for the currently selected tenant, and append `_compartment=<current_tenant_ref>` to all search queries.

**Example:**

```typescript
// User selects "Downtown Clinic" in the UI
const currentTenant = 'Organization/clinic-a';

// All queries include _compartment filter
const patients = await medplum.search('Patient', {
  _compartment: currentTenant
});

const observations = await medplum.search('Observation', {
  _compartment: currentTenant
});
```

**Use Case**: When you need UI-level tenant isolation but want to maintain API-level access to all tenants. This allows users to switch between tenants in the UI without re-authenticating, while ensuring the UI only displays data from the selected tenant.

## Option 3: Multiple ProjectMemberships

**Description**: Create a separate `ProjectMembership` for each tenant. Each membership has its own AccessPolicy with a single tenant parameter, enforcing isolation at the API level.

::warning
Multiple ProjectMemberships is an **advanced Medplum feature**. ProjectMemberships are a crucial part of access control to the Medplum data store and determine what resources a user can read, write, or modify. Misconfiguring ProjectMemberships or AccessPolicies can result in Users being locked out of necessary resources or gaining unauthorized access to data.

**Before implementing multiple memberships:**
- Thoroughly understand [AccessPolicies](/docs/access/access-policies) and how they work
- Test extensively in a development environment
- Consider consulting with Medplum support or the community if you're unsure
::

**Implementation**: Use the [`/admin/projects/:projectId/invite`](/docs/api/project-admin/invite) endpoint with `forceNewMembership: true` to create additional memberships for the same user.

With multiple ProjectMemberships, each membership grants access to only one tenant, ensuring strict API-level isolation:

<Tabs groupId="tenant-type">
  <TabItem value="organization" label="Organization">

```mermaid
%%{init: {'theme': 'neutral' }}%%
graph TB
    subgraph OrgSection[" "]
        PracOrg[Practitioner/practitioner-1]
        UserOrg[User/user-1]
        PMOrg1[ProjectMembership/membership-1<br/>Downtown Clinic]
        PMOrg2[ProjectMembership/membership-2<br/>Uptown Clinic]
        Org1[Organization/clinic-a]
        Org2[Organization/clinic-b]
        PatOrg1[Patient/patient-1]
        PatOrg2[Patient/patient-2]
        PatOrgShared[Patient/patient-3<br/>Shared]
        PracOrg --> UserOrg
        UserOrg --> PMOrg1
        UserOrg --> PMOrg2
        PMOrg1 --> Org1
        PMOrg2 --> Org2
        Org1 --> PatOrg1
        Org1 --> PatOrgShared
        Org2 --> PatOrg2
        Org2 --> PatOrgShared
    end
    
    style PracOrg fill:#e8f5e9
    style UserOrg fill:#e8f5e9
    style PMOrg1 fill:#fff4e1
    style PMOrg2 fill:#fff4e1
    style Org1 fill:#e1f5ff
    style Org2 fill:#e1f5ff
    style PatOrg1 fill:#e8f5e9
    style PatOrg2 fill:#e8f5e9
    style PatOrgShared fill:#fff4e1
```

  </TabItem>
  <TabItem value="healthcare-service" label="HealthcareService">

```mermaid
%%{init: {'theme': 'neutral' }}%%
graph TB
    subgraph HSSection[" "]
        PracHS[Practitioner/practitioner-1]
        UserHS[User/user-1]
        PMHS1[ProjectMembership/membership-1<br/>Cardiology Service]
        PMHS2[ProjectMembership/membership-2<br/>Oncology Service]
        HS1[HealthcareService/cardiology-service]
        HS2[HealthcareService/oncology-service]
        PatHS1[Patient/patient-1]
        PatHS2[Patient/patient-2]
        PatHSShared[Patient/patient-3<br/>Shared]
        PracHS --> UserHS
        UserHS --> PMHS1
        UserHS --> PMHS2
        PMHS1 --> HS1
        PMHS2 --> HS2
        HS1 --> PatHS1
        HS1 --> PatHSShared
        HS2 --> PatHS2
        HS2 --> PatHSShared
    end
    
    style PracHS fill:#e8f5e9
    style UserHS fill:#e8f5e9
    style PMHS1 fill:#fff4e1
    style PMHS2 fill:#fff4e1
    style HS1 fill:#e1f5ff
    style HS2 fill:#e1f5ff
    style PatHS1 fill:#e8f5e9
    style PatHS2 fill:#e8f5e9
    style PatHSShared fill:#fff4e1
```

  </TabItem>
  <TabItem value="careteam" label="CareTeam">

```mermaid
%%{init: {'theme': 'neutral' }}%%
graph TB
    subgraph CTSection[" "]
        PracCT[Practitioner/practitioner-1]
        UserCT[User/user-1]
        PMCT1[ProjectMembership/membership-1<br/>Diabetes Care Team]
        PMCT2[ProjectMembership/membership-2<br/>Hypertension Care Team]
        CT1[CareTeam/diabetes-care-team]
        CT2[CareTeam/hypertension-care-team]
        PatCT1[Patient/patient-1]
        PatCT2[Patient/patient-2]
        PatCTShared[Patient/patient-3<br/>Shared]
        PracCT --> UserCT
        UserCT --> PMCT1
        UserCT --> PMCT2
        PMCT1 --> CT1
        PMCT2 --> CT2
        CT1 --> PatCT1
        CT1 --> PatCTShared
        CT2 --> PatCT2
        CT2 --> PatCTShared
    end
    
    style PracCT fill:#e8f5e9
    style UserCT fill:#e8f5e9
    style PMCT1 fill:#fff4e1
    style PMCT2 fill:#fff4e1
    style CT1 fill:#e1f5ff
    style CT2 fill:#e1f5ff
    style PatCT1 fill:#e8f5e9
    style PatCT2 fill:#e8f5e9
    style PatCTShared fill:#fff4e1
```

  </TabItem>
</Tabs>

**Example:**

<Tabs groupId="tenant-type">
  <TabItem value="organization" label="Organization">

```typescript
// First membership - Downtown Clinic
await medplum.post('admin/projects/:projectId/invite', {
  resourceType: 'Practitioner',
  firstName: 'Jane',
  lastName: 'Smith',
  email: 'dr.smith@example.com',
  password: 'secure-password',
  membership: {
    access: [
      {
        policy: { reference: 'AccessPolicy/mso-policy' },
        parameter: [
          {
            name: 'organization',
            valueReference: { reference: 'Organization/clinic-a' }
          }
        ]
      }
    ],
    identifier: [
      {
        system: 'https://medplum.com/identifier/label',
        value: 'Downtown Clinic'
      }
    ]
  }
});

// Second membership - Uptown Clinic
await medplum.post('admin/projects/:projectId/invite', {
  resourceType: 'Practitioner',
  firstName: 'Jane',
  lastName: 'Smith',
  email: 'dr.smith@example.com',
  forceNewMembership: true,  // Required for creating additional membership
  membership: {
    access: [
      {
        policy: { reference: 'AccessPolicy/mso-policy' },
        parameter: [
          {
            name: 'organization',
            valueReference: { reference: 'Organization/clinic-b' }
          }
        ]
      }
    ],
    identifier: [
      {
        system: 'https://medplum.com/identifier/label',
        value: 'Uptown Clinic'
      }
    ]
  }
});
```

  </TabItem>
  <TabItem value="healthcare-service" label="HealthcareService">

```typescript
// First membership - Cardiology Service
await medplum.post('admin/projects/:projectId/invite', {
  resourceType: 'Practitioner',
  firstName: 'Jane',
  lastName: 'Smith',
  email: 'dr.smith@example.com',
  password: 'secure-password',
  membership: {
    access: [
      {
        policy: { reference: 'AccessPolicy/service-policy' },
        parameter: [
          {
            name: 'healthcare_service',
            valueReference: { reference: 'HealthcareService/cardiology-service' }
          }
        ]
      }
    ],
    identifier: [
      {
        system: 'https://medplum.com/identifier/label',
        value: 'Cardiology Service'
      }
    ]
  }
});

// Second membership - Oncology Service
await medplum.post('admin/projects/:projectId/invite', {
  resourceType: 'Practitioner',
  firstName: 'Jane',
  lastName: 'Smith',
  email: 'dr.smith@example.com',
  forceNewMembership: true,  // Required for creating additional membership
  membership: {
    access: [
      {
        policy: { reference: 'AccessPolicy/service-policy' },
        parameter: [
          {
            name: 'healthcare_service',
            valueReference: { reference: 'HealthcareService/oncology-service' }
          }
        ]
      }
    ],
    identifier: [
      {
        system: 'https://medplum.com/identifier/label',
        value: 'Oncology Service'
      }
    ]
  }
});
```

  </TabItem>
  <TabItem value="careteam" label="CareTeam">

```typescript
// First membership - Diabetes Care Team
await medplum.post('admin/projects/:projectId/invite', {
  resourceType: 'Practitioner',
  firstName: 'Jane',
  lastName: 'Smith',
  email: 'dr.smith@example.com',
  password: 'secure-password',
  membership: {
    access: [
      {
        policy: { reference: 'AccessPolicy/careteam-policy' },
        parameter: [
          {
            name: 'care_team',
            valueReference: { reference: 'CareTeam/diabetes-care-team' }
          }
        ]
      }
    ],
    identifier: [
      {
        system: 'https://medplum.com/identifier/label',
        value: 'Diabetes Care Team'
      }
    ]
  }
});

// Second membership - Hypertension Care Team
await medplum.post('admin/projects/:projectId/invite', {
  resourceType: 'Practitioner',
  firstName: 'Jane',
  lastName: 'Smith',
  email: 'dr.smith@example.com',
  forceNewMembership: true,  // Required for creating additional membership
  membership: {
    access: [
      {
        policy: { reference: 'AccessPolicy/careteam-policy' },
        parameter: [
          {
            name: 'care_team',
            valueReference: { reference: 'CareTeam/hypertension-care-team' }
          }
        ]
      }
    ],
    identifier: [
      {
        system: 'https://medplum.com/identifier/label',
        value: 'Hypertension Care Team'
      }
    ]
  }
});
```

  </TabItem>
</Tabs>

**Sign-In Flow**: When a user with multiple ProjectMemberships signs in, Medplum automatically prompts them to choose which membership to use for their session. Each membership can have a custom label (via the `https://medplum.com/identifier/label` identifier system) to help users distinguish between them.

![Medplum Multiple ProjectMemberships Sign-In Screenshot](/img/blog/multiple-project-memberships-signin.png)

**Use Case**: When you need strict API-level tenant isolation. This ensures that once authenticated, the user's API access is limited to only the selected tenant's data. This is the most secure approach and is ideal for scenarios where regulatory requirements or organizational policies mandate strict data isolation.

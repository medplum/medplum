---
tags: [auth, access-control]
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Multiple ProjectMemberships in One Project

## Introduction

In Medplum, a single user can have multiple [`ProjectMembership`](/docs/api/fhir/medplum/projectmembership) resources within the same project, each with different [AccessPolicies](/docs/access/access-policies). This feature enables more sophisticated access control scenarios where a user need to access different tenants or tiers of data in your project at different times.

The most common use case is **clinic specific access** for a practitioner working for multiple healthcare clinics within a Managed Service Organization (MSO). In this model, each ProjectMembership provides a login to access a different clinic's data. See our [MSO data model blog post](/blog/multi-tenant-mso) for more background on this pattern.

### Do I need multiple memberships?

Without multiple ProjectMemberships, using the standard [MSO Access model](/blog/multi-tenant-mso), a User can have multiple [ProjectMembership parameters](/docs/access/access-policies#parameterized-policies) to access multiple tenants in your project, but the User's API level access will cannot be limited to any subset of those tenants at any given time.

<details>
<summary>Access to Multiple Tenants at Once - Does not require multiple memberships</summary>
```ts
{
 "resourceType": "ProjectMembership",
 //...
 "access": [
   { //First tenant that the user has access to
     "parameter": [
       {
         "name": "organization",
         "valueReference": {
           "reference": "Organization/0195b4a4-0ed7-71ed-80cf-c6fff1e31152",
           "display": "Kings Landing Health Center"
         }
       }
     ],
     "policy": {
       "reference": "AccessPolicy/0195b4a3-374e-75cf-a6f0-0bcee7c754c5"
     }
   },
   { //Second tenant that the user has access to
     "parameter": [
       {
         "name": "organization",
         "valueReference": {
           "reference": "Organization/0195b4a4-0ed7-71ed-80cf-c6fff1e31152",
           "display": "Winterfell Pediatrics Center"
         }
       }
     ],
     "policy": {
       "reference": "AccessPolicy/0195b4a3-374e-75cf-a6f0-0bcee7c754c5"
     }
   }
 ]
}
```
</details>

If you need the ability for the user to **only access one tenant at a time**, you can also use the [_compartment](/docs/search/advanced-search-parameters#_compartment) search parameter for all queries to further segment the data beyond anything that the AccessPolicy is enforcing. 

So, continuing the example above, that **User's API level access** would be limited to only the data for those two Organization tenants, and then **at the browser level**, you would use the [_compartment](/docs/search/advanced-search-parameters#_compartment) parameter to segment your queries to only the data for the selected tenant.

**Finally, if you need users to access only one tenant at a time and you need this access to be enforced at the API level, then you will need to use multiple memberships.**

:::warning Advanced Feature

Multiple ProjectMemberships is an **advanced Medplum feature**. ProjectMemberships are a crucial part of access control to the Medplum data store and determine what resources a user can read, write, or modify. Misconfiguring ProjectMemberships or AccessPolicies can result in Users being locked out of necessary resources or gaining unauthorized access to data.

**Before implementing multiple memberships:**
- Thoroughly understand [AccessPolicies](/docs/access/access-policies) and how they work
- Test extensively in a development environment
- Carefully plan your access control model
- Consider consulting with Medplum support or the community if you're unsure

:::

Common use cases include:

- **Multi-Organization Systems**: A practitioner working for multiple healthcare organizations within a Managed Service Organization (MSO), where each login provides access to a different organization's data. Read about the [Multi-Tenant Access Control](/docs/access/multi-tenant-access-policy) pattern and see our [MSO data model blog post](/blog/multi-tenant-mso) for more details.
- **Clinic-Specific Access**: A clinician who works at multiple clinic locations that needs different segmented login access to each clinic's patients and resources

## Core Concepts

By default, when you invite a user who is already a member of a project, Medplum will return an error to prevent duplicate memberships. However, you can override this behavior using the `forceNewMembership` parameter, which allows you to create additional ProjectMemberships for the same user.

Each ProjectMembership can have:
- A unique set of [AccessPolicies](/docs/access/access-policies) via the `access` or `accessPolicy` fields where a different parameter can be passed to the AccessPolicy for each membership
- Custom identifiers to help users distinguish between memberships during sign-in
- Different administrative privileges

```mermaid
graph TD
    User["<strong>User</strong><br/>email: dr.smith@example.com"]
    
    PM1["<strong>ProjectMembership 1</strong><br/><br/><em>identifier:</em> 'Downtown Clinic'<br/><br/><em>access.parameter:</em><br/>Organization/downtown-clinic"]
    AP["<strong>AccessPolicy</strong><br/>MSO Access Policy"]
    PM2["<strong>ProjectMembership 2</strong><br/><br/><em>identifier:</em> 'Uptown Clinic'<br/><br/><em>access.parameter:</em><br/>Organization/uptown-clinic"]
    
    Profile["<strong>Practitioner</strong><br/>Dr. Jane Smith"]
    
    User --> PM1
    User --> PM2
    
    PM1 --> Profile
    PM2 --> Profile
    
    PM1 -.-> AP
    PM2 -.-> AP
    
    style User fill:#e1f5ff
    style PM1 fill:#fff4e1
    style PM2 fill:#fff4e1
    style Profile fill:#e8f5e9
    style AP fill:#f3e5f5
```

## Creating Multiple Memberships

### Using forceNewMembership

To create multiple ProjectMemberships for the same user, use the [`/admin/projects/:projectId/invite`](/docs/api/project-admin/invite) endpoint with `forceNewMembership: true`.

<Tabs groupId="language">
  <TabItem value="ts" label="TypeScript">

```ts
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
            valueReference: { reference: 'Organization/downtown-clinic' }
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
// Note: forceNewMembership: true allows creating another membership
await medplum.post('admin/projects/:projectId/invite', {
  resourceType: 'Practitioner',
  firstName: 'Jane',
  lastName: 'Smith',
  email: 'dr.smith@example.com',
  forceNewMembership: true,
  membership: {
    access: [
      {
        policy: { reference: 'AccessPolicy/mso-policy' },
        parameter: [
          {
            name: 'organization',
            valueReference: { reference: 'Organization/uptown-clinic' }
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
  <TabItem value="cli" label="CLI">

```bash
# First membership - Downtown Clinic
medplum post admin/projects/:projectId/invite \
'{
  "resourceType": "Practitioner",
  "firstName": "Jane",
  "lastName": "Smith",
  "email": "dr.smith@example.com",
  "password": "secure-password",
  "membership": {
    "access": [
      {
        "policy": { "reference": "AccessPolicy/mso-policy" },
        "parameter": [
          {
            "name": "organization",
            "valueReference": { "reference": "Organization/downtown-clinic" }
          }
        ]
      }
    ],
    "identifier": [
      {
        "system": "https://medplum.com/identifier/label",
        "value": "Downtown Clinic"
      }
    ]
  }
}'

# Second membership - Uptown Clinic
medplum post admin/projects/:projectId/invite \
'{
  "resourceType": "Practitioner",
  "firstName": "Jane",
  "lastName": "Smith",
  "email": "dr.smith@example.com",
  "forceNewMembership": true,
  "membership": {
    "access": [
      {
        "policy": { "reference": "AccessPolicy/mso-policy" },
        "parameter": [
          {
            "name": "organization",
            "valueReference": { "reference": "Organization/uptown-clinic" }
          }
        ]
      }
    ],
    "identifier": [
      {
        "system": "https://medplum.com/identifier/label",
        "value": "Uptown Clinic"
      }
    ]
  }
}'
```

  </TabItem>
  <TabItem value="curl" label="cURL">

```bash
# First membership - Downtown Clinic
curl https://api.medplum.com/admin/projects/:projectId/invite \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
  "resourceType": "Practitioner",
  "firstName": "Jane",
  "lastName": "Smith",
  "email": "dr.smith@example.com",
  "password": "secure-password",
  "membership": {
    "access": [
      {
        "policy": { "reference": "AccessPolicy/mso-policy" },
        "parameter": [
          {
            "name": "organization",
            "valueReference": { "reference": "Organization/downtown-clinic" }
          }
        ]
      }
    ],
    "identifier": [
      {
        "system": "https://medplum.com/identifier/label",
        "value": "Downtown Clinic"
      }
    ]
  }
}'

# Second membership - Uptown Clinic
curl https://api.medplum.com/admin/projects/:projectId/invite \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
  "resourceType": "Practitioner",
  "firstName": "Jane",
  "lastName": "Smith",
  "email": "dr.smith@example.com",
  "forceNewMembership": true,
  "membership": {
    "access": [
      {
        "policy": { "reference": "AccessPolicy/mso-policy" },
        "parameter": [
          {
            "name": "organization",
            "valueReference": { "reference": "Organization/uptown-clinic" }
          }
        ]
      }
    ],
    "identifier": [
      {
        "system": "https://medplum.com/identifier/label",
        "value": "Uptown Clinic"
      }
    ]
  }
}'
```

  </TabItem>
</Tabs>

### Key Parameters

| Parameter | Description |
|-----------|-------------|
| `forceNewMembership` | When `true`, creates a new ProjectMembership even if one already exists for this user in the project. Required for creating multiple memberships. |
| `membership.access` | Array of [AccessPolicy](/docs/access/access-policies) references with optional parameters. Allows fine-grained access control with parameterized policies. |
| `membership.identifier` | Array of identifiers to label the membership. Use the system `https://medplum.com/identifier/label` to add a display label. |

## Sign-In with Multiple Memberships

When a user has multiple ProjectMemberships, the Medplum sign-in process automatically prompts them to choose which membership to use for their session.

### Adding Labels to Memberships

To help users distinguish between their memberships, add an identifier with the system `https://medplum.com/identifier/label`:

```ts
{
  identifier: [
    {
      system: 'https://medplum.com/identifier/label',
      value: 'Downtown Clinic'
    }
  ]
}
```

The `SignInForm` component from `@medplum/react` will display this label in the membership selection screen, making it easy for users to identify which membership they want to use.

![Medplum Multiple ProjectMemberships Sign-In Screenshot](./multiple-project-memberships-signin.png)


### Sign-In Flow

1. User enters their email and password
2. If the user has multiple ProjectMemberships, they see a selection screen
3. Each membership shows:
   - The profile display name (e.g., "Dr. Jane Smith")
   - The project display name
   - The custom label (e.g., "Downtown Clinic") if an identifier is set
4. User selects the desired membership
5. Access is granted according to that membership's AccessPolicy



---
sidebar_position: 2
---

# Users

Medplum supports the standard SCIM `Users` API endpoints.

## Schemas

SCIM resources include a `schemas` property that declares which schemas a resource conforms to.

The base `User` schema is `urn:ietf:params:scim:schemas:core:2.0:User`.

Medplum users always have a corresponding FHIR "profile" resource, which can be a `Patient`, `Practitioner`, or `RelatedPerson`. To specify the desired FHIR resource type, you must include an entry in the `schemas` property with one of the following Medplum extensions:

1. `urn:ietf:params:scim:schemas:extension:medplum:2.0:Patient`
2. `urn:ietf:params:scim:schemas:extension:medplum:2.0:Practitioner`
3. `urn:ietf:params:scim:schemas:extension:medplum:2.0:RelatedPerson`

For example, consider this `Practitioner`:

```json
{
  "schemas": [
    "urn:ietf:params:scim:schemas:core:2.0:User",
    "urn:ietf:params:scim:schemas:extension:medplum:2.0:Practitioner"
  ],
  "name": {
    "givenName": "Alice",
    "familyName": "Smith"
  },
  "userName": "alice@example.com",
  "emails": [
    {
      "value": "alice@example.com"
    }
  ]
}
```

For example, consider this `Patient`:

```json
{
  "schemas": [
    "urn:ietf:params:scim:schemas:core:2.0:User",
    "urn:ietf:params:scim:schemas:extension:medplum:2.0:Patient"
  ],
  "name": {
    "givenName": "Bob",
    "familyName": "Jones"
  },
  "userName": "bob@example.com",
  "emails": [
    {
      "value": "bob@example.com"
    }
  ]
}
```

## Create a user

Create a user by making an HTTP `POST` request to `https://api.medplum.com/scim/v2/Users`

```bash
curl https://api.medplum.com/scim/v2/Users \
 -H "Authorization: Bearer MY_ACCESS_TOKEN" \
 -H "Content-Type: application/json" \
 -d '{
  "schemas": [
    "urn:ietf:params:scim:schemas:core:2.0:User",
    "urn:ietf:params:scim:schemas:extension:medplum:2.0:Practitioner"
  ],
  "name": {
    "givenName": "Alice",
    "familyName": "Smith"
  },
  "userName": "alice@example.com",
  "emails": [
    {
      "value": "alice@example.com"
    }
  ]
}'
```

## Read a user

Read a user by making an HTTP `GET` request to `https://api.medplum.com/scim/v2/Users/{id}`

```bash
curl https://api.medplum.com/scim/v2/Users/MY_USER_ID \
 -H "Authorization: Bearer MY_ACCESS_TOKEN"
```

## Update a user

Update a user by making an HTTP `PUT` request to `https://api.medplum.com/scim/v2/Users/{id}`

```bash
curl -X PUT https://api.medplum.com/scim/v2/Users \
 -H "Authorization: Bearer MY_ACCESS_TOKEN" \
 -H "Content-Type: application/json" \
 -d '{
  "schemas": [
    "urn:ietf:params:scim:schemas:core:2.0:User",
    "urn:ietf:params:scim:schemas:extension:medplum:2.0:Practitioner"
  ],
  "id": "41ecbf96-8296-4fac-801c-5e78042ba436",
  "name": {
    "givenName": "Alice",
    "familyName": "Smith"
  },
  "userName": "alice@example.com",
  "emails": [
    {
      "value": "alice@example.com"
    }
  ],
  "externalId": "test-external-id"
}'
```

## Search users

Search for users by making an HTTP `GET` request to `https://api.medplum.com/scim/v2/Users`

```bash
curl https://api.medplum.com/scim/v2/Users \
 -H "Authorization: Bearer MY_ACCESS_TOKEN"
```

---
sidebar_position: 2
---

# Users

Medplum supports the standard SCIM `Users` API endpoints.

## Schemas

SCIM resources include a `schemas` property that declares which schemas a resource conforms to.

The base `User` schema is `urn:ietf:params:scim:schemas:core:2.0:User`.

## User Type and Username

Medplum users always have a corresponding FHIR "profile" resource, which can be a `Patient`, `Practitioner`, or `RelatedPerson`. To specify the desired FHIR resource type, you must include a `userType` property with the FHIR resource type.

For example, consider this `Practitioner`:

```json
{
  "schemas": ["urn:ietf:params:scim:schemas:core:2.0:User"],
  "userType": "Practitioner",
  "name": {
    "givenName": "Alice",
    "familyName": "Smith"
  },
  "emails": [{ "value": "alice@example.com" }]
}
```

For example, consider this `Patient`:

```json
{
  "schemas": ["urn:ietf:params:scim:schemas:core:2.0:User"],
  "userType": "Patient",
  "name": {
    "givenName": "Bob",
    "familyName": "Jones"
  },
  "emails": [{ "value": "bob@example.com" }]
}
```

The SCIM `userName` property will be the system generated FHIR resource ID. This can be used in combination with the SCIM `userType` to identify the FHIR resource for the user.

## Create a user

Create a user by making an HTTP `POST` request to `https://api.medplum.com/scim/v2/Users`

```bash
curl https://api.medplum.com/scim/v2/Users \
 -H "Authorization: Bearer MY_ACCESS_TOKEN" \
 -H "Content-Type: application/json" \
 -d '{
  "schemas": ["urn:ietf:params:scim:schemas:core:2.0:User"],
  "userType": "Practitioner",
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
  "schemas": ["urn:ietf:params:scim:schemas:core:2.0:User"],
  "userType": "Practitioner",
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

## Delete a user

Delete a user by making an HTTP `DELETE` request to `https://api.medplum.com/scim/v2/Users/{id}`

```bash
curl -X DELETE https://api.medplum.com/scim/v2/Users/MY_USER_ID \
 -H "Authorization: Bearer MY_ACCESS_TOKEN"
```

Note that deleting the user does not delete any of the corresponding FHIR resources.

## Search users

Search for users by making an HTTP `GET` request to `https://api.medplum.com/scim/v2/Users`

```bash
curl https://api.medplum.com/scim/v2/Users \
 -H "Authorization: Bearer MY_ACCESS_TOKEN"
```

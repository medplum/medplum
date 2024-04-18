---
id: deleting-data
toc_max_heading_level: 5
sidebar_position: 3
---

# Deleting Data

The management of healthcare information relies heavily on the effective and secure handling of data. A critical aspect of FHIR data store management is the "delete" operation, which ensures the removal of outdated or erroneous records as necessary. This article will provide an overview of the deleting data in Medplum, including the differences between "soft delete" and "hard delete" methods. Understanding these distinctions is essential for making informed decisions when dealing with sensitive healthcare data.

## Delete Operation

The FHIR [`delete`](https://hl7.org/fhir/http.html#delete) operation performs a "soft" or "logical" delete. This means that data is not permanently removed from the database.

The delete interaction removes an existing resource. The interaction is performed by an HTTP DELETE command as shown:

```
DELETE [base]/[resourceType]/[id]
```

For example, suppose a Patient resource with ID 123 is created (via an HTTP `POST /Patient`) and subsequently deleted (via an HTTP `DELETE Patient/123`). This will cause a second version of the Patient/123 resource to be created with version Patient/123/\_history/2 that is marked as deleted.

This patient will no longer appear in search results, and attempts to read the resource (using an HTTP `GET Patient/123`) will fail with an "HTTP 410 Gone" response.

However, the original content of the resource is not destroyed. It can still be found using two FHIR operations:

- Reading resource history: `GET Patient/123/_history`
- Reading a resource version: `GET Patient/123/_history/1`

## Expunge Operation

The Medplum `$expunge` operation performs a "hard" or "physical" delete. This means that the data is permanently removed from the database, including all resource history.

```
POST [base]/[resourceType]/[id]/$expunge
```

Subsequent requests for the resource will result in HTTP 404 Not Found, as if the resource never existed.

The `$expunge` operation is only available to users with "Super Administrator" access.

### Expunge Everything Option

The Medplum `$expunge` operation supports an optional `everything` flag to systematically expunge everything in the resource [compartment](https://hl7.org/fhir/R4/compartmentdefinition.html). Currently, only the "Patient" and "Project" compartments are supported.

```
POST [base]/[resourceType]/[id]/$expunge?everything=true
```

:::warning Expunging a Project

If you expunge a [`Project`](/docs/api/fhir/medplum/project), it will be _permanently_ deleted and you will no longer be able to sign in or access it in any way.

:::

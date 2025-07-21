---
id: deleting-data
toc_max_heading_level: 5
sidebar_position: 4
---

# Deleting Data

The management of healthcare information relies heavily on the effective and secure handling of data. A critical aspect of FHIR data store management is the `delete` operation, which ensures the removal of outdated or erroneous records as necessary. This article will provide an overview of the deleting data in Medplum, including the differences between "soft delete" and "hard delete" methods. Understanding these distinctions is essential for making informed decisions when dealing with sensitive healthcare data.

## Delete Operation

The FHIR [`delete`](https://hl7.org/fhir/http.html#delete) operation performs a "soft" or "logical" delete. This means that data is not permanently removed from the database.

The delete interaction removes an existing resource. The interaction is performed by an HTTP `DELETE` request as shown:

```
DELETE [base]/[resourceType]/[id]
```

For example, suppose a [`Patient`](/docs/api/fhir/resources/patient) resource with ID 123 is created (via an HTTP `POST /Patient`) and subsequently deleted (via an HTTP `DELETE Patient/123`). This will cause a second version of the `Patient/123` resource to be created with version `Patient/123/\_history/2` that is marked as deleted.

This patient will no longer appear in search results, and attempts to read the resource (using an HTTP `GET Patient/123`) will fail with an "HTTP 410 Gone" response.

However, the original content of the resource is not destroyed. It can still be found using two FHIR operations:

- Reading resource history: `GET Patient/123/_history`
- Reading a resource version: `GET Patient/123/_history/1`

:::caution Referential Integrity on Deletes

Referential integrity is **not** supported for deletes at this time.

:::

## Expunge Operation

The Medplum `$expunge` operation performs a "hard" or "physical" delete. This means that the data is permanently removed from the database, including all resource history.

```
POST [base]/[resourceType]/[id]/$expunge
```

Subsequent requests for the resource will result in HTTP 404 Not Found, as if the resource never existed.

The `$expunge` operation is only available to users with administrator access to the Project in which the resource belongs.

### Expunge Everything Option

The Medplum `$expunge` operation supports an optional `everything` flag to systematically expunge everything in the resource [compartment](https://hl7.org/fhir/R4/compartmentdefinition.html). Currently, only the "Patient" and "Project" compartments are supported.

```
POST [base]/[resourceType]/[id]/$expunge?everything=true
```

:::warning Expunging a Project

If you expunge a [`Project`](/docs/api/fhir/medplum/project), it will be _permanently_ deleted and you will no longer be able to sign in or access it in any way.

:::

### Restoring Data

Sometimes you may want to restore data that has been accidentally. The following script looks at the history of a resource and restores it if it is currently deleted.

```typescript
import { MedplumClient } from '@medplum/core';
import { Resource, Patient } from '@medplum/fhirtypes';

async function restoreDeletedResource(
  medplum: MedplumClient,
  resourceType: string,
  resourceId: string
): Promise<Resource | undefined> {
  try {
    // Get the history of the resource
    const history = await medplum.readHistory(resourceType as Resource['resourceType'], resourceId);

    if (!history || !history.entry || history.entry.length === 0) {
      console.log(`No history found for ${resourceType}/${resourceId}`);
      return undefined;
    }

    // Debug logging for all history entries
    console.log('History entries:', JSON.stringify(history.entry, null, 2));

    // Check if the resource was deleted (410 status with deleted OperationOutcome)
    const isDeleted = history.entry.some(
      (entry) =>
        entry.response?.status === '410' && entry.response?.outcome?.issue?.some((issue) => issue.code === 'deleted')
    );

    if (isDeleted) {
      console.log(`Found deleted resource ${resourceType}/${resourceId}`);

      // Get the most recent non-deleted version
      const latestVersion = history.entry.find((entry) => entry.response?.status === '200' && entry.resource)?.resource;

      if (!latestVersion) {
        console.log('Could not find a version to restore');
        return undefined;
      }

      // Create a new version of the resource
      const restoredResource = {
        ...latestVersion,
        meta: {
          ...latestVersion.meta,
          tag:
            latestVersion.meta?.tag?.filter(
              (tag) => !(tag.system === 'http://terminology.hl7.org/CodeSystem/v3-ActReason' && tag.code === 'DELETED')
            ) || [],
        },
        active: true,
      };

      // Update the resource
      const result = await medplum.updateResource(restoredResource);
      console.log(`Successfully restored ${resourceType}/${resourceId}`);
      return result;
    } else {
      console.log(`Resource ${resourceType}/${resourceId} is not deleted`);
      return undefined;
    }
  } catch (error) {
    console.error('Error restoring resource:', error);
    throw error;
  }
}
```

---
id: binary-presigned-url
title: Binary $presigned-url
weight: 300
---

Binary resources containing non-FHIR data such as images or PDF documents are often used to enrich and add context
to clinical resources. If an unauthenticated user needs to read or write those files, this can be allowed by generating
a pre-signed URL for the Binary. Any user can access this temporary secure URL to either read the contents of the file,
or to write new data to the Binary.

## Invocation

```
GET [base]/Binary/[id]/$presigned-url
```

## Input Query Parameters

| Parameter | Cardinality | Type      | Description                                                                     |
| --------- | ----------- | --------- | ------------------------------------------------------------------------------- |
| `upload`  | 0..1        | `boolean` | Whether the link is used for reading (default = false) or writing (set to true) |

## Output Parameters

| Parameter | Cardinality | Type     | Description                                                            |
| --------- | ----------- | -------- | ---------------------------------------------------------------------- |
| `url`     | 1..1        | `string` | The presigned URL granting read or write access to the Binary contents |

Generating an upload URL (`upload=true`) requires the same authorization as updating the Binary: the caller's
access policy must permit `update` on the stored Binary and satisfy any `writeConstraint`, and must not list `data`
in `readonlyFields` or `hiddenFields`. Generating the URL counts against the write quota.

Write constraints are evaluated as for an update by the caller: `%before` is the stored Binary, and `%after` is the
stored Binary with the `meta` an update would set, such as a new `versionId` and the caller as `author`. Uploading
content does not create a new Binary version; it replaces the content of the version the URL was issued for.

If the Binary is updated after the URL is issued, the upload does not replace the newer version's content. With
local filesystem storage the upload is rejected with `409 Conflict`. With cloud storage (S3, GCS or Azure) the upload
succeeds but writes to the now-historical version, so the current version keeps its previous content.

## Example

### Request

**Read URL:**

```http
GET /fhir/R4/Binary/[id]/$presigned-url
```

**Write URL:**

```http
GET /fhir/R4/Binary/[id]/$presigned-url?upload=true
```

### Response

```json
{
  "resourceType": "Parameters",
  "parameter": [
    {
      "name": "url",
      "valueUri": "https://storage.medplum.com/binary/c138a343-02e1-40f0-801f-e3d7f5317d4e/f4609304-c1ca-4a5b-af7d-77a289a2ac55?Signature=RJKaFn[...]"
    }
  ]
}
```

### Using the Presigned URL

{{< warning >}}

The generated presigned URLs are **unauthenticated**, and can be accessed by anyone who has the URL
without an access token. Care should be taken to ensure that the URLs are restricted to the intended users.

{{< /warning >}}

For reads/downloads, the URL can be accessed directly to retrieve the Binary contents:

```bash
curl 'https://storage.medplum.com/binary/c138a343-02e1-40f0-801f-e3d7f5317d4e/f4609304-c1ca-4a5b-af7d-77a289a2ac55?Signature=RJKaFn[...]'
```

To send data to a presigned upload URL, use an HTTP PUT request with the same content type as defined in the resource's `Binary.contentType` field:

```bash
curl -X PUT 'https://storage.medplum.com/binary/c138a343-02e1-40f0-801f-e3d7f5317d4e/f4609304-c1ca-4a5b-af7d-77a289a2ac55?Signature=RJKaFn[...]' \
    -H 'Content-Type: text/plain'
    --data-raw 'lorem ipsum dolor sit amet...'
```

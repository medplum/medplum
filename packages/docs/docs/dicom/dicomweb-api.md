---
sidebar_position: 3
---

# DICOMweb API

Medplum serves [DICOMweb](https://www.dicomstandard.org/using/dicomweb) under `/dicomweb` on the same
host as the FHIR API. On Medplum's hosted service that is:

```
https://api.medplum.com/dicomweb
```

Every endpoint requires the same authentication as the rest of the Medplum API — an OAuth2 bearer
token in the `Authorization` header — and resolves against the authenticated user's project and
[access policy](/docs/access/access-policies). There is no separate DICOM credential to manage, and a
user who cannot read a `DicomStudy` cannot retrieve it over DICOMweb either. CORS is enabled on the
`/dicomweb/` prefix so browser-based viewers can call it directly.

:::info[Beta]

The implemented surface is the subset needed for storage and for a DICOMweb viewer to display a study.

:::

## Implemented endpoints

| Service     | Method | Path                                                                                     |
| ----------- | ------ | ---------------------------------------------------------------------------------------- |
| **STOW-RS** | `POST` | `/dicomweb/studies`                                                                      |
| **STOW-RS** | `POST` | `/dicomweb/studies/{studyUid}`                                                           |
| **QIDO-RS** | `GET`  | `/dicomweb/studies`                                                                      |
| **QIDO-RS** | `GET`  | `/dicomweb/studies/{studyUid}/series`                                                    |
| **WADO-RS** | `GET`  | `/dicomweb/studies/{studyUid}/series/{seriesUid}/metadata`                               |
| **WADO-RS** | `GET`  | `/dicomweb/studies/{studyUid}/series/{seriesUid}/instances/{instanceUid}/frames/{frame}` |

## STOW-RS: Store instances

```
POST /dicomweb/studies
POST /dicomweb/studies/{studyUid}
Content-Type: multipart/related; type="application/dicom"; boundary={boundary}
```

The request body is a `multipart/related` body with one part per DICOM instance, each part carrying
`Content-Type: application/dicom` and a complete DICOM Part 10 file. Both forms behave identically —
the `{studyUid}` in the path is accepted for spec compatibility but the study is always determined
from each instance's own Study Instance UID.

Parts are processed as they stream in, so a multi-instance upload does not have to be buffered in
memory. Each part is simultaneously written to a `Binary` and parsed for metadata.

```bash
curl -X POST https://api.medplum.com/dicomweb/studies \
  -H "Authorization: Bearer $MEDPLUM_TOKEN" \
  -H 'Content-Type: multipart/related; type="application/dicom"; boundary=boundary' \
  --data-binary @body.multipart
```

Constructing that multipart body by hand is tedious; the [Medplum CLI](./cli.md) and the
[Agent](./agent-dimse.md) both do it for you.

**Response `200`** — a DICOM JSON dataset containing a Referenced SOP Sequence `(0008,1199)` with one
item per stored instance, each carrying the Referenced SOP Class UID `(0008,1150)`, Referenced SOP
Instance UID `(0008,1155)`, and a Retrieve URL `(0008,1190)`.

**Response `415`** — the `Content-Type` was not `multipart/related`.

**Response `400`** — the multipart body could not be parsed, or an instance failed to store.

:::caution

The Retrieve URL returned in the response is currently a placeholder of the form `/instances/{id}/raw`, which is not a resolvable endpoint. Use the QIDO-RS and WADO-RS routes below to retrieve stored instances, or the `Endpoint` referenced by the study's [`ImagingStudy`](./data-model.md#relationship-to-fhir-imagingstudy).

:::

## QIDO-RS: Search for studies

```
GET /dicomweb/studies
Accept: application/dicom+json
```

Returns every `DicomStudy` visible to the caller as a DICOM JSON array, one dataset per study, with
the study-level attributes described in the [data model](./data-model.md#dicomstudy).

Query parameters such as `PatientName`, `AccessionNumber`, `ModalitiesInStudy`, `limit`, `offset`,
`includefield`, and `fuzzymatching` are accepted by the route but are not applied — every study the
caller can read is returned. For filtered or paginated queries, use the
[FHIR search API](./data-model.md#search-parameters) against `DicomStudy`.

## QIDO-RS: Search for series

```
GET /dicomweb/studies/{studyUid}/series
Accept: application/dicom+json
```

Returns the series in one study, as a DICOM JSON array. Each series dataset also repeats the
study-level attributes, which is what viewers expect when building a study/series tree.

**Response `404`** — no study with that Study Instance UID is visible to the caller.

**Response `400`** — the study UID was missing or malformed.

## WADO-RS: Retrieve series metadata

```
GET /dicomweb/studies/{studyUid}/series/{seriesUid}/metadata
Accept: application/dicom+json
```

Returns a DICOM JSON array with the full metadata dataset for every instance in the series — the
cleaned dataset stored in [`DicomInstance.metadata`](./data-model.md#what-lands-in-metadata). This is
the call a viewer makes to learn the geometry of a series before it starts pulling frames.

**Response `404`** — the study or the series could not be found.

## WADO-RS: Retrieve frames

```
GET /dicomweb/studies/{studyUid}/series/{seriesUid}/instances/{instanceUid}/frames/{frame}
```

Returns one frame of pixel data as a `multipart/related` body. Frame numbers are **1-based**, as in
the DICOM standard. The part's `Content-Type` reflects the encoding the frame was stored in — see
[pixel data extraction](./data-model.md#pixel-data-extraction).

| Status | Meaning                                                                                |
| ------ | -------------------------------------------------------------------------------------- |
| `200`  | Frame returned                                                                         |
| `400`  | Missing or malformed study UID, series UID, instance UID, or a frame number below 1    |
| `404`  | Study, series, or instance not found — or pixel data has not been extracted for it yet |
| `416`  | The requested frame number exceeds the number of frames available for the instance     |

A `404` immediately after upload usually means the background worker has not finished extracting
pixel data. Retry, or check that the `dicom` worker is running.

Only a single frame number is supported per request. The standard's comma-separated frame list
(`/frames/1,2,3`) is not implemented.

## See also

- [DICOM Standard Part 18: Web Services](https://dicom.nema.org/medical/dicom/current/output/html/part18.html)
- [STOW-RS](https://dicom.nema.org/medical/dicom/current/output/html/part18.html#sect_10.5) ·
  [WADO-RS](https://dicom.nema.org/medical/dicom/current/output/html/part18.html#sect_10.4) ·
  [QIDO-RS](https://dicom.nema.org/medical/dicom/current/output/html/part18.html#sect_10.6)

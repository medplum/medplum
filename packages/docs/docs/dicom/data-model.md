---
sidebar_position: 2
---

# DICOM Data Model

DICOM organizes imaging into a three-level hierarchy — **study**, **series**, **instance** — and
Medplum models that hierarchy directly with three resource types rather than flattening it into FHIR
`ImagingStudy`. The DICOM information model and the FHIR one disagree in enough places that a lossy
translation at ingest time would throw away exactly the attributes a viewer needs to render the
study. Storing the DICOM shape natively means a DICOMweb response can be reconstructed faithfully,
while the resources remain searchable and access-controlled like anything else in the project.

An [`ImagingStudy`](#relationship-to-fhir-imagingstudy) is generated _alongside_ those resources, not
instead of them, so the study is reachable from the rest of the chart without the DICOM shape being
lost.

```mermaid
flowchart TD
  Study["DicomStudy<br/><i>studyInstanceUid</i>"]
  Series["DicomSeries<br/><i>seriesInstanceUid</i>"]
  Instance["DicomInstance<br/><i>sopInstanceUid</i>"]
  Raw["Binary<br/><i>original .dcm file</i>"]
  Pixels["Binary[]<br/><i>pixel data, one per frame</i>"]
  Imaging["ImagingStudy<br/><i>derived, chart-facing</i>"]
  Endpoint["Endpoint<br/><i>WADO-RS</i>"]

  Study --> Series
  Series --> Instance
  Instance -- "raw" --> Raw
  Instance -- "pixelData" --> Pixels
  Study -. "derived" .-> Imaging
  Imaging -- "endpoint" --> Endpoint
```

## Resource types

### DicomStudy

One [`DicomStudy`](/docs/api/fhir/medplum/dicomstudy) per DICOM Study Instance UID. Created
conditionally on `studyInstanceUid`, so instances arriving over separate uploads collect under one
study.

| Field                           | DICOM tag     | Notes                                                   |
| ------------------------------- | ------------- | ------------------------------------------------------- |
| `studyInstanceUid`              | `(0020,000D)` | Required. The conditional-create key.                   |
| `studyId`                       | `(0020,0010)` |                                                         |
| `studyDate`                     | `(0008,0020)` | Converted `YYYYMMDD` → `YYYY-MM-DD`                     |
| `studyTime`                     | `(0008,0030)` | Converted `HHMMSS` → `HH:MM:SS`                         |
| `accessionNumber`               | `(0008,0050)` |                                                         |
| `instanceAvailability`          | `(0008,0056)` |                                                         |
| `modalitiesInStudy`             | `(0008,0061)` |                                                         |
| `referringPhysiciansName`       | `(0008,0090)` |                                                         |
| `timezoneOffsetFromUtc`         | `(0008,0201)` |                                                         |
| `patientName`                   | `(0010,0010)` | The `Alphabetic` component of the DICOM person name     |
| `patientId`                     | `(0010,0020)` | A DICOM string, **not** a reference to a FHIR `Patient` |
| `patientBirthDate`              | `(0010,0030)` | Converted `YYYYMMDD` → `YYYY-MM-DD`                     |
| `patientSex`                    | `(0010,0040)` |                                                         |
| `numberOfStudyRelatedSeries`    | `(0020,1206)` |                                                         |
| `numberOfStudyRelatedInstances` | `(0020,1208)` |                                                         |

### DicomSeries

One [`DicomSeries`](/docs/api/fhir/medplum/dicomseries) per Series Instance UID, created conditionally on `seriesInstanceUid`.

| Field                             | DICOM tag                            |
| --------------------------------- | ------------------------------------ |
| `study`                           | Reference to the parent `DicomStudy` |
| `seriesInstanceUid`               | `(0020,000E)`                        |
| `seriesNumber`                    | `(0020,0011)`                        |
| `modality`                        | `(0008,0060)`                        |
| `seriesDescription`               | `(0008,103E)`                        |
| `timezoneOffsetFromUtc`           | `(0008,0201)`                        |
| `numberOfSeriesRelatedInstances`  | `(0020,1209)`                        |
| `performedProcedureStepStartDate` | `(0040,0244)`                        |
| `performedProcedureStepStartTime` | `(0040,0245)`                        |

### DicomInstance

One [`DicomInstance`](/docs/api/fhir/medplum/dicominstance) per stored SOP instance, created
conditionally on `sopInstanceUid` so that re-uploading the same instance resolves the existing
resource rather than duplicating it.

| Field                   | DICOM tag                    | Notes                                                                      |
| ----------------------- | ---------------------------- | -------------------------------------------------------------------------- |
| `study`, `series`       |                              | References to the parent resources                                         |
| `sopClassUid`           | `(0008,0016)`                |                                                                            |
| `sopInstanceUid`        | `(0008,0018)`                |                                                                            |
| `instanceAvailability`  | `(0008,0056)`                |                                                                            |
| `timezoneOffsetFromUtc` | `(0008,0201)`                |                                                                            |
| `instanceNumber`        | `(0020,0013)`                | Defaults to `"1"` when the source file omits it                            |
| `rows`, `columns`       | `(0028,0010)`, `(0028,0011)` |                                                                            |
| `bitsAllocated`         | `(0028,0100)`                |                                                                            |
| `numberOfFrames`        | `(0028,0008)`                |                                                                            |
| `metadata`              |                              | The instance's full DICOM JSON dataset, serialized as a JSON string        |
| `raw`                   |                              | Reference to the `Binary` holding the original `.dcm` file                 |
| `pixelData`             |                              | References to per-frame pixel `Binary` resources, filled in asynchronously |

## What lands in `metadata`

`DicomInstance.metadata` is the instance's DICOM JSON dataset — the same representation a WADO-RS
metadata request returns — stored as a string. It is cleaned on the way in:

- **File meta group `(0002,xxxx)`**, **`PixelData` `(7FE0,0010)`**, and **overlay data `(60xx,3000)`**
  are removed. Pixel data lives in `Binary` resources, not in the JSON.
- **Binary-valued attributes** (value representations `OB`, `OD`, `OF`, `OL`, `OV`, `OW`, `UN`) up to
  **10 KB** are inlined as base64 under `InlineBinary`. Anything larger is dropped rather than
  bloating the resource.
- **Sequences** are cleaned recursively, so the same rules apply at every nesting level.

Only the **first 100 KB** of each uploaded file is parsed for metadata during the STOW-RS request.
That is far more than a DICOM header needs and it keeps ingest streaming rather than buffering whole
studies in memory. The complete file is always preserved in the `raw` `Binary` regardless.

## Background processing

Storing an instance does not extract its pixels inline — that would make every `C-STORE` wait on
decoding. The work is split across two queues, by how often it needs to run.

Both entry points feed the same queues. Whether an instance arrives through
[STOW-RS](./dicomweb-api.md#stow-rs-store-instances) or as a `DicomInstance` created through the FHIR
API, the same jobs run, so the two routes produce the same resources.

Both run on the `DicomQueue` BullMQ queue, as two job types.

**Instance job — once per instance.** Triggered when a `DicomInstance` is created or its `raw`
reference changes (three attempts, exponential backoff starting at one second):

1. The worker reads the raw `Binary` and parses the full file.
2. Instance attributes read from the dataset — `rows`, `columns`, `bitsAllocated`, `numberOfFrames`,
   and the rest — are patched onto the `DicomInstance`.
3. `PixelData` is split into frames. Each frame is written as its own `Binary`, with
   `securityContext` set to the `DicomInstance` so it inherits the instance's access control.
4. `DicomInstance.pixelData` is patched with references to those binaries, in frame order.

**Study job — once per study.** Enqueued for the parent study whenever an instance lands or is
deleted, and deduplicated per study, so a five-hundred-instance upload recomputes the study about
twice rather than five hundred times:

1. Study-level aggregates — `modalitiesInStudy`, `numberOfStudyRelatedSeries`,
   `numberOfStudyRelatedInstances` — are recomputed from the stored series and instances.
2. `numberOfSeriesRelatedInstances` is recomputed for every series in the study.
3. The study's [`ImagingStudy`](#relationship-to-fhir-imagingstudy) is created or refreshed.

These are Q/R query keys the archive is responsible for computing, so the values a sender puts in its
own headers are ignored rather than trusted. Until this job runs they are absent rather than wrong.

The `Binary.contentType` of each frame is derived from the file's Transfer Syntax UID:

| Transfer Syntax UID                    | Content type               |
| -------------------------------------- | -------------------------- |
| `1.2.840.10008.1.2.4.50`, `.57`, `.70` | `image/jpeg`               |
| `1.2.840.10008.1.2.4.90`, `.91`        | `image/jp2`                |
| `1.2.840.10008.1.2.4.201`, `.202`      | `image/jxl`                |
| Anything else, including uncompressed  | `application/octet-stream` |

Until the instance job finishes, [frame retrieval](./dicomweb-api.md#wado-rs-retrieve-frames)
returns `404` for that instance. Studies and series appear in query results immediately, because they
are created during the upload itself; their instance counts fill in once the study job runs.

The worker is named `dicom` and can be enabled or disabled per server instance through the
`workers.enabled` configuration setting, like any other Medplum worker. A deployment that runs
workers on dedicated hosts needs `dicom` enabled on at least one of them, or pixel data is never
extracted, aggregate counts stay absent, and no `ImagingStudy` is created.

## Search parameters

The DICOM resources are searchable through the normal [FHIR search API](/docs/search).

| Resource        | Search parameters                                                                                                                                                                      |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DicomStudy`    | `study-instance-uid`, `study-id`, `study-date`, `study-time`, `accession-number`, `modalities`, `referring-physicians-name`, `patient-name`, `patient-id`                              |
| `DicomSeries`   | `study`, `series-instance-uid`, `series-number`, `performed-procedure-step-start-date`, `performed-procedure-step-start-time`, `scheduled-procedure-step-id`, `requested-procedure-id` |
| `DicomInstance` | `study`, `series`, `sop-class-uid`, `sop-instance-uid`, `instance-number`                                                                                                              |

```ts
// Every CT and MR study for an accession number
const studies = await medplum.searchResources('DicomStudy', {
  'accession-number': 'A12345',
});

// Every series in a study
const series = await medplum.searchResources('DicomSeries', {
  study: `DicomStudy/${studies[0].id}`,
});
```

Note that `modalities` is the only `token` parameter in the set; the rest of the study-level
parameters are `string` searches, and `study-date` is a `date` search.

## Relationship to FHIR ImagingStudy

Medplum generates an [`ImagingStudy`](/docs/api/fhir/resources/imagingstudy) for every `DicomStudy`,
as part of the study job described above. It is a derived, chart-facing view: the DICOM resources
remain the source of truth, and the `ImagingStudy` is what a `DiagnosticReport` cites and what a
search by patient returns.

It is identified by the study's UID, so it converges rather than duplicating:

```json
{
  "resourceType": "ImagingStudy",
  "identifier": [{ "system": "urn:dicom:uid", "value": "urn:oid:1.2.826.0.1.3680043.10.543.2" }],
  "status": "available",
  "numberOfSeries": 2,
  "numberOfInstances": 148,
  "endpoint": [{ "reference": "Endpoint/..." }]
}
```

`ImagingStudy.endpoint` points at an [`Endpoint`](/docs/api/fhir/resources/endpoint) with
`connectionType` `dicom-wado-rs`, created once per project, whose `address` is this server's DICOMweb
root. A client composes retrieve URLs from it:

```
{endpoint.address}/studies/{identifier}/series/{series.uid}/instances/{sopInstanceUid}
```

Series are listed on the `ImagingStudy`; individual instances are not. Enumerating every SOP instance
would make the resource grow without bound on a large study, and viewers read the instance list from
[`/series/{uid}/metadata`](./dicomweb-api.md#wado-rs-retrieve-series-metadata) anyway.

### Which fields the server owns

The study job rewrites only the fields it derives — `identifier`, `status`, `modality`, `started`,
`endpoint`, `numberOfSeries`, `numberOfInstances`, and `series`. Everything else is yours to set:
`basedOn`, `encounter`, `procedureReference`, `note`, `description`, and the rest survive every
recompute. Resources the server maintains carry the tag `https://medplum.com/dicom|derived-from-dicom`.

Two fields latch, so that a human correction is never undone by a later instance arriving:

- **`subject`** — resolved by matching `DicomStudy.patientId` against `Patient.identifier` within the
  same project. A single match becomes a real reference; zero or multiple matches leave a logical
  reference carrying the DICOM Patient ID and name. A logical reference is upgraded to a real one
  once exactly one `Patient` matches, but a real reference is **never** downgraded — so correcting
  the patient by hand, or through a [Bot](/docs/bots), sticks.
- **`status`** — `cancelled` and `entered-in-error` are preserved. Everything else follows the
  instance count: `available` once the study has instances, `registered` before that.

:::note Upgrading from an earlier version

If you already create `ImagingStudy` resources in a Bot using the `urn:dicom:uid` identifier, the
server will **adopt** them rather than create duplicates: the fields listed above start being
recomputed, and everything else your Bot set is preserved. Bots that write to the server-owned fields
should be retired, since their values will be overwritten on the next recompute.

:::

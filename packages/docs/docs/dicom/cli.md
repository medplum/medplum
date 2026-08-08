---
sidebar_position: 5
---

# DICOM with the Medplum CLI

The [Medplum CLI](/docs/cli) can store a DICOM file through STOW-RS directly, which makes it the
fastest way to get imaging into a project — no Agent, no modality, no hand-built multipart body.

```bash
npm install --global @medplum/cli
medplum login
medplum dicomweb stow MRBRAIN.DCM
```

## `medplum dicomweb stow`

```
medplum dicomweb stow <file>
```

Reads a DICOM Part 10 file, wraps it in a `multipart/related` body with
`Content-Type: application/dicom`, and posts it to `/dicomweb/studies` on the configured server. The
file is streamed from disk into the request rather than read into memory first.

On success the STOW-RS response is printed — a DICOM JSON dataset containing a Referenced SOP
Sequence naming the SOP Class UID and SOP Instance UID of each stored instance.

The command accepts the CLI's standard [authentication](/docs/cli#authentication) and server
options — stored credentials from `medplum login`, `MEDPLUM_CLIENT_ID` / `MEDPLUM_CLIENT_SECRET`
environment variables, or `--client-id` / `--client-secret` flags. Set `MEDPLUM_BASE_URL` to target a
self-hosted server.

One file per invocation; there is no glob or directory form yet. To upload a directory of instances,
loop in the shell:

```bash
for f in ./study/*.dcm; do medplum dicomweb stow "$f"; done
```

Each file is a separate STOW-RS request, but because studies and series are created conditionally on
their DICOM UIDs, the instances still collect under a single `DicomStudy` and its series.

## Verifying the upload

Instances land in the [DICOM data model](./data-model.md) immediately; pixel data extraction happens
in the background. Check with an ordinary FHIR search:

```bash
medplum get 'DicomStudy?_count=5'
medplum get "DicomSeries?study=DicomStudy/$STUDY_ID"
```

Or over DICOMweb:

```bash
curl https://api.medplum.com/dicomweb/studies \
  -H "Authorization: Bearer $MEDPLUM_TOKEN"
```

## See also

- [Medplum CLI](/docs/cli)
- [DICOMweb API](./dicomweb-api.md)
- [OHIF Viewer](./ohif-viewer.md) — to see what you just uploaded at [viewer.medplum.com](https://viewer.medplum.com)

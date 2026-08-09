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
medplum dicomweb stow <files...> [--batch-size <count>]
```

Reads DICOM Part 10 files, wraps them in a `multipart/related` body with
`Content-Type: application/dicom`, and posts them to `/dicomweb/studies` on the configured server.
Files are streamed from disk into the request rather than read into memory first.

On success the STOW-RS response of each request is printed — a DICOM JSON dataset containing a
Referenced SOP Sequence naming the SOP Class UID and SOP Instance UID of each stored instance.

The command accepts the CLI's standard [authentication](/docs/cli#authentication) and server
options — stored credentials from `medplum login`, `MEDPLUM_CLIENT_ID` / `MEDPLUM_CLIENT_SECRET`
environment variables, or `--client-id` / `--client-secret` flags. Set `MEDPLUM_BASE_URL` to target a
self-hosted server.

### Files, directories, and patterns

Each argument can be a file, a directory, or a glob pattern, and you can mix them freely:

```bash
medplum dicomweb stow MRBRAIN.DCM                 # One file
medplum dicomweb stow ./study                     # Every DICOM file in the tree, recursively
medplum dicomweb stow ./study/*.dcm               # Expanded by your shell
medplum dicomweb stow './study/**/*.dcm'          # Quoted, so the CLI expands it
```

An unquoted pattern such as `*.dcm` is expanded by the shell before the CLI ever runs, so it arrives
as an ordinary list of file names. Quote the pattern to have the CLI expand it instead — which is
also how to pass patterns on Windows, where the shell does no expansion at all.

:::caution Quote `**` patterns

**Always quote a pattern containing `**`.** bash only treats `**` as "any number of directories"
when `globstar` is enabled, and it is off by default. Unquoted, `./study/**/*.dcm` expands to
*exactly one* directory level, so a three-level study uploads only its middle level — and because
the shell collapsed the pattern before the CLI started, nothing can detect this and warn you. Quoted,
the CLI expands it and `**` recurses to any depth, including zero, so top level files match too.

Passing the directory itself avoids the question entirely:

```bash
medplum dicomweb stow ./study
```

:::

Patterns are matched case-insensitively, since `.dcm` and `.DCM` are both common. Directories are
searched by content rather than by name, so their casing never matters.

Directories are searched recursively, to any depth. When expanding a directory or a pattern, files
that are not DICOM instances are skipped, so pointing at an export folder does not try to upload its README. A
file counts as DICOM if it carries the `DICM` prefix at byte 128, or if it begins with a
`(0002,xxxx)` File Meta Information tag — the two forms the server's reader recognizes structurally,
including the extensionless file names common on modality exports and DICOM media. The server also
accepts raw datasets carrying no File Meta Information, which have no header to test for, so those
are recognized by a `.dcm`, `.dicom`, or `.ima` extension. `DICOMDIR` index files are always
skipped, and the count of skipped files is printed. A file named explicitly on the command line is
always sent, with no such filtering.

### Batching

Instances are sent in batches of 25 per STOW-RS request; use `--batch-size` to change that. Batching
keeps a large upload from riding on one long-lived request, so a failure costs one batch rather than
the whole study. Studies and series are created conditionally on their DICOM UIDs, so instances
still collect under a single `DicomStudy` and its series no matter how they are split across
requests.

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

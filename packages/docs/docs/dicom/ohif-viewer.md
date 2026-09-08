---
sidebar_position: 6
---

# OHIF Viewer

[OHIF](https://ohif.org/) is an open source, zero-footprint DICOM viewer that reads studies over
DICOMweb. Medplum's DICOMweb implementation targets the request sequence OHIF makes, so a study
stored in Medplum can be displayed without a gateway or a separate image server in between.

## Medplum hosted cloud

Medplum's hosted cloud is preconfigured with an OHIF instance at
**[viewer.medplum.com](https://viewer.medplum.com)**. There is nothing to deploy and nothing to
configure — sign in with your Medplum account and the studies in your project are there.

![An MR brain study stored in Medplum, displayed in the OHIF Viewer at viewer.medplum.com](/img/blog/2026-08-dicom-ohif-viewer.webp)

The viewer authenticates against Medplum with OAuth2 and reads over the same
[DICOMweb API](./dicomweb-api.md) documented here, so what you see in it is exactly what any DICOMweb
client would get.

## Self-hosted viewer deployments

Running your own OHIF deployment against a self-hosted Medplum server is an enterprise feature.
Contact us at [hello@medplum.com](mailto:hello@medplum.com) to talk through it.

## How OHIF uses the API

| OHIF screen     | Request                                                                                       | Status in Medplum             |
| --------------- | --------------------------------------------------------------------------------------------- | ----------------------------- |
| Study list      | `GET /dicomweb/studies?limit=101&offset=0&fuzzymatching=false&includefield=00081030,00080060` | Works; parameters are ignored |
| Study → series  | `GET /dicomweb/studies/{studyUid}/series`                                                     | Works                         |
| Series metadata | `GET /dicomweb/studies/{studyUid}/series/{seriesUid}/metadata`                                | Works                         |
| Image display   | `GET /dicomweb/studies/{studyUid}/series/{seriesUid}/instances/{instanceUid}/frames/{frame}`  | Works, one frame per request  |

Image retrieval goes through **WADO-RS**, not WADO-URI — Medplum implements frame retrieval and does
not implement WADO-URI at all. Any DICOMweb viewer pointed at Medplum needs to be configured the same
way.

## Authentication and access control

The `/dicomweb` endpoints use the same OAuth2 bearer tokens as the rest of the Medplum API, and
resolve against the authenticated user's project and [access policy](/docs/access/access-policies).
A user who cannot read a `DicomStudy` cannot retrieve it in the viewer either — imaging inherits the
project's existing authorization rather than introducing a second model to keep in sync.

CORS is enabled on the `/dicomweb/` prefix, so a viewer served from a different origin can call the
API directly from the browser.

## FHIRcast

OHIF hardcodes its FHIRcast hub URL to `/api/hub`. Medplum aliases that path to the latest FHIRcast
version it supports, so OHIF's context synchronization works against a Medplum server without
reconfiguration. See [FHIRcast](/docs/fhircast) for what context synchronization enables — driving
the viewer's displayed study from a clinician's selection elsewhere in the application.

## See also

- [OHIF Viewer documentation](https://docs.ohif.org/)
- [DICOMweb API](./dicomweb-api.md)

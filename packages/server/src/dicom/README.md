# Medplum DICOM

Implemented DICOMweb/WADO services:

- QIDO-RS: Look up studies, series, images
- WADO-RS: Retrieve studies, series, images, frames and metadata
- STOW-RS: Store DICOM instances/images
- WADO-URI: Web Access to DICOM objects

Also includes OHIF Viewer integration, based on http://dicomcloud.com/docs/ohif-integration/

## QIDO-RS

https://dicom.nema.org/medical/dicom/current/output/html/part18.html#table_10.6.1-4

| Resource                | Study | Series | Instance |
| ----------------------- | ----- | ------ | -------- |
| All Studies             | X     |        |          |
| Study's Series          |       | X      |          |
| Study's Instances       |       | X      | X        |
| All Series              | X     | X      |          |
| Study Series' Instances |       |        | X        |
| All Instances           | X     | X      | X        |

### Required search parameters

https://dicom.nema.org/medical/dicom/current/output/html/part18.html#table_10.6.1-5

| IE Level | Attribute Name                      | Tag         |
| -------- | ----------------------------------- | ----------- |
| Study    | Study Date                          | (0008,0020) |
|          | Study Time                          | (0008,0030) |
|          | Accession Number                    | (0008,0050) |
|          | Modalities In Study                 | (0008,0061) |
|          | Referring Physician Name            | (0008,0090) |
|          | Patient Name                        | (0010,0010) |
|          | Patient ID                          | (0010,0020) |
|          | Study Instance UID                  | (0020,000D) |
|          | Study ID                            | (0020,0010) |
| Series   | Modality                            | (0008,0060) |
|          | Series Instance UID                 | (0020,000E) |
|          | Series Number                       | (0020,0011) |
|          | Performed Procedure Step Start Date | (0040,0244) |
|          | Performed Procedure Step Start Time | (0040,0245) |
|          | Request Attributes Sequence         | (0040,0275) |
|          | Scheduled Procedure Step ID         | (0040,0009) |
|          | Requested Procedure ID              | (0040,1001) |
| Instance | SOP Class UID                       | (0008,0016) |
|          | SOP Instance UID                    | (0008,0018) |
|          | Instance Number                     | (0020,0013) |

### Required return attributes

#### Study Resource

https://dicom.nema.org/medical/dicom/current/output/html/part18.html#table_10.6.3-3

| Attribute Name                    | Tag         | Type | Condition                                                                   |
| --------------------------------- | ----------- | ---- | --------------------------------------------------------------------------- |
| Study Date                        | (0008,0020) | R    |                                                                             |
| Study Time                        | (0008,0030) | R    |                                                                             |
| Accession Number                  | (0008,0050) | R    |                                                                             |
| Instance Availability             | (0008,0056) | C    | Shall be present if known                                                   |
| Modalities in Study               | (0008,0061) | R    |                                                                             |
| Referring Physician's Name        | (0008,0090) | R    |                                                                             |
| Timezone Offset From UTC          | (0008,0201) | C    | Shall be present if known                                                   |
| Retrieve URL                      | (0008,1190) | C    | Shall be present if the Instance is retrievable by the Retrieve Transaction |
| Patient's Name                    | (0010,0010) | R    |                                                                             |
| Patient ID                        | (0010,0020) | R    |                                                                             |
| Patient's Birth Date              | (0010,0030) | R    |                                                                             |
| Patient's Sex                     | (0010,0040) | R    |                                                                             |
| Study Instance UID                | (0020,000D) | U    |                                                                             |
| Study ID                          | (0020,0010) | R    |                                                                             |
| Number of Study Related Series    | (0020,1206) | R    |                                                                             |
| Number of Study Related Instances | (0020,1208) | R    |                                                                             |

#### Series Resource

https://dicom.nema.org/medical/dicom/current/output/html/part18.html#table_10.6.3-4

| Attribute Name                      | Tag         | Type | Condition                                                                   |
| ----------------------------------- | ----------- | ---- | --------------------------------------------------------------------------- |
| Modality                            | (0008,0060) | R    |                                                                             |
| Timezone Offset From UTC            | (0008,0201) | C    | Shall be present if known                                                   |
| Series Description                  | (0008,103E) | C    | Shall be present if known                                                   |
| Retrieve URL                        | (0008,1190) | C    | Shall be present if the Instance is retrievable by the Retrieve Transaction |
| Series Instance UID                 | (0020,000E) | U    |                                                                             |
| Series Number                       | (0020,0011) | R    |                                                                             |
| Number of Series Related Instances  | (0020,1209) | R    |                                                                             |
| Performed Procedure Step Start Date | (0040,0244) | C    | Shall be present if known                                                   |
| Performed Procedure Step Start Time | (0040,0245) | C    | Shall be present if known                                                   |
| Request Attributes Sequence         | (0040,0275) | C    | Shall be present if known                                                   |
| > Scheduled Procedure Step ID       | (0040,0009) | R    |                                                                             |
| > Requested Procedure ID            | (0040,1001) | R    |                                                                             |

#### Instance Resource

## OHIF Viewer Search

### Study List

```
Default search
https://d33do7qe4w26qo.cloudfront.net/dicomweb/studies?limit=101&offset=0&fuzzymatching=false&includefield=00081030%2C00080060

Full search
https://d33do7qe4w26qo.cloudfront.net/dicomweb/studies?PatientName=*Neptune*&00100020=*0000002*&AccessionNumber=*000041576*&StudyDescription=*DFCI*&ModalitiesInStudy=CT&limit=101&offset=0&fuzzymatching=false&includefield=00081030%2C00080060

?PatientName=*Neptune*
&00100020=*0000002*
&AccessionNumber=*000041576*
&StudyDescription=*DFCI*
&ModalitiesInStudy=CT
&limit=101
&offset=0
&fuzzymatching=false
&includefield=00081030%2C00080060
```

### Series List

### Image Viewer

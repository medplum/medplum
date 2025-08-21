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

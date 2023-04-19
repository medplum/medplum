---
sidebar_position: 6
---

# Bulk FHIR API

Medplum supports the [Bulk FHIR API 2.0.0](https://hl7.org/fhir/uv/bulkdata/STU2/). The Bulk FHIR API uses [Backend Services Authorization](https://www.hl7.org/fhir/smart-app-launch/backend-services.html).

The premise of the Bulk FHIR API is that it allows you to create a **bulk export of data for multiple patients**. To specify which patients need to be included in the export, construct a [Group](/docs/api/fhir/resources/group) resource and add specific patients as `Group.member.entity.`

To start the process of exporting the resources, make an HTTP `GET` request for `/fhir/R4/Group/<GROUP_ID>/$export?_outputFormat=ndjson`. This initiates a Bulk Data Export transaction and return links to download URLs for requested resources.

```bash
curl 'https://api.medplum.com/fhir/R4/Group/<GROUP_ID>/$export?_outputFormat=ndjson' \
  -H 'Authorization: Bearer <ACCESS_TOKEN>'
```

Once the Bulk Data Export is complete, a [BulkDataExport resource](/docs/api/fhir/medplum/bulkdataexport) will become available with links to all of the exports for download.

| Resource in Medplum App                | Usage in Bulk FHIR                                                       |
| -------------------------------------- | ------------------------------------------------------------------------ |
| [Group](https://app.medplum.com/Group) | All patients you want to include must be included as Group.member.entity |

## Related Reading

- [Reporting and Analytics](/docs/analytics) overview
- [ONC Certification](/docs/compliance/onc) compliance docs
- [Standardized API for patient and population services](https://www.healthit.gov/test-method/standardized-api-patient-and-population-services) on HealthIT.gov

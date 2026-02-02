---
sidebar_position: 6
---

import ExampleCode from '!!raw-loader!@site/../examples/src/api/fhir/operations/bulk-fhir.py';
import MedplumCodeBlock from '@site/src/components/MedplumCodeBlock';

# Bulk FHIR API

Medplum supports the [Bulk FHIR API 2.0.0](https://hl7.org/fhir/uv/bulkdata/STU2/). The Bulk FHIR API uses [Backend Services Authorization](https://www.hl7.org/fhir/smart-app-launch/backend-services.html).

## Use Cases

- **Population Health Reporting**: Export data for entire patient populations for analytics and reporting dashboards
- **Data Migration**: Transfer large datasets between FHIR-compliant systems during system migrations
- **Regulatory Compliance**: Meet ONC, MIPS, and other regulatory requirements for bulk data access
- **Research Data Extraction**: Export de-identified or consented patient data for clinical research studies
- **Data Warehousing**: Populate analytics data warehouses with comprehensive FHIR data exports

The premise of the Bulk FHIR API is that it allows you to create a **bulk export of data for multiple patients**. There are different ways to export data:

- From a Group of patients, which will export everything in each patient's compartment
- As a system level export of all FHIR resources in a Project

The export process is asynchronous, and you will need to poll a status URL returned when you start the export. After the [BulkDataExport resource](/docs/api/fhir/medplum/bulkdataexport) with the export results is available, it will contain a set of URLs where you can download the exported data in [NDJSON][ndjson] format.

[ndjson]: https://jsonlines.org/

## Access Policy Requirements

Because the bulk export process is asynchronous, your [AccessPolicy](/docs/access/access-policies) must grant you access to the `AsyncJob` resourceType. This is required to poll the status of the export operation. Without access to `AsyncJob`, you will not be able to check the status of your export or retrieve the results.

Your AccessPolicy should include an entry like this:

```json
{
  "resourceType": "AccessPolicy",
  "resource": [
    {
      "resourceType": "AsyncJob",
      "readonly": true
    }
  ]
}
```

## Group Export

To specify which patients need to be included in the export, construct a [Group](/docs/api/fhir/resources/group) resource and add specific patients as `Group.member.entity.`

To start the process of exporting the resources, make an HTTP `GET` request for `/fhir/R4/Group/<GROUP_ID>/$export?_outputFormat=ndjson`. This initiates a Bulk Data Export transaction and return links to download URLs for requested resources.

```bash
curl 'https://api.medplum.com/fhir/R4/Group/<GROUP_ID>/$export?_outputFormat=ndjson' \
  -H 'Authorization: Bearer <ACCESS_TOKEN>'
```

| Resource in Medplum App                | Usage in Bulk FHIR                                                       |
| -------------------------------------- | ------------------------------------------------------------------------ |
| [Group](https://app.medplum.com/Group) | All patients you want to include must be included as Group.member.entity |

## System Level Export

An export can also be performed for all resources in a Project by making a `GET` request for `/fhir/R4/$export`.

<MedplumCodeBlock language="py" showLineNumbers>
  {ExampleCode}
</MedplumCodeBlock>

## Related Reading

- [Reporting and Analytics](/docs/analytics) overview
- [ONC Certification](/docs/compliance/onc) compliance docs
- [Standardized API for patient and population services](https://www.healthit.gov/test-method/standardized-api-patient-and-population-services) on HealthIT.gov

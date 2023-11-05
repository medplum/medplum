---
sidebar_position: 3
---

# CLIA/CAP Certification

:::caution Note

This section is under construction.

:::

The following materials support a CLIA certified lab that is using Medplum for their primary LIS pass their CLIA/CAP Inspection.

## Materials and Usage

The materials below can help prepare for your inspection.

| Resource Name     | Description                                       | Access                                                                                               |
| ----------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Checklist         | General Lab checklist                             | [Request Access](https://drive.google.com/file/d/1Km-VLLV4HJ0ZcL51rkQoY4MnxUHlSTKt/view?usp=sharing) |
| Security Overview | General information on Medplum security practices | [medplum.com](https://www.medplum.com/security)                                                      |

## Checklist

Review and refer to the following items in preparation for your inspection.

- GEN.43150 User Authentication Phase II
  - [ ] Users and their access policies are represented as [Project Memberships](https://app.medplum.com/ProjectMembership)
  - [ ] [Access Policies](https://app.medplum.com/AccessPolicy) represent the permissions
- GEN.43325 Public Network Security Phase II
  - [ ] [Logins](/docs/api/fhir/medplum/login) track authentication events and are logged
- GEN.43335 System Vulnerability Testing
  - [ ] Regular penetration tests and security review performed, see the [security page](/security#application-security)
- GEN.43450 Calculated Patient Data Verification Phase II
  - [ ] Implementation typically done through [Bots](https://app.medplum.com/Bot)
  - [ ] All calculations that include reportable results must have [unit tests](/docs/bots/unit-testing-bots)
  - [ ] QC Samples and quality control runs are typically represented as ServiceRequests or Observations
- GEN.43750 Specimen Quality Comment Phase II
  - [ ] Specimen related queries and reports
    - [ ] All [Specimens](https://app.medplum.com/Specimen)
    - [ ] [Specimen Quality](https://app.medplum.com/Specimen?_count=20&_fields=id,_lastUpdated,status&_offset=0&_sort=-_lastUpdated&status=unsatisfactory)
    - [ ] [Specimen.condition](https://app.medplum.com/Specimen?_count=20&_fields=id,_lastUpdated,condition&_offset=0&_sort=-_lastUpdated) should include codes from the [`SpecimenRejectionReason` code system](https://terminology.hl7.org/CodeSystem-v2-0490.html) that will be the basis for rejecting.
- GEN.43800 Data Input ID Phase II
  - All data in Medplum is versioned, and [version history](/docs/sdk/core.medplumclient.readhistory) for each resource is available
- GEN.43825 Result Verification Phase II
  - [ ] Diagnostic report related queries
    - [ ] All [Diagnostic Reports](https://app.medplum.com/DiagnosticReport)
    - [ ] [Corrected reports](https://app.medplum.com/DiagnosticReport?_count=20&_fields=id,_lastUpdated,subject,code,status&_offset=0&_sort=-_lastUpdated&status=corrected)
  - Automatic validation on Medplum is often implemented via Bot
  - [ ] In most implementations [Bots](https://app.medplum.com/Bot) perform validation or pre-validation calculations
  - [ ] Panel Management is stored as [PlanDefinition](https://app.medplum.com/PlanDefinition) resources, including reference ranges
  - [ ] Call logs (also known as Panic Logs) for patient contact are often implemented as [CommunicationRequest](https://app.medplum.com/CommunicationRequest?_count=20&_fields=id,_lastUpdated,category,patient&_offset=0&_sort=-_lastUpdated)
- GEN.43837 Downtime Result Reporting Phase II
  - Refer to documentation on [availability](/security#availability)
- GEN.20316 QMS Indicators of Quality - Phase II

  - Patient/Specimen Identification: Percent of patient wristbands with errors (ie, mislabels), percent of specimens with patient labeling errors (ie, mislabels), or percent of results with identification errors
    - [ ] The main field for recording issues is [Specimen.condition](https://app.medplum.com/Specimen?_count=20&_fields=id,_lastUpdated,condition&_offset=0&_sort=-_lastUpdated) should include codes from the [`SpecimenRejectionReason` code system](https://terminology.hl7.org/CodeSystem-v2-0490.html).
    - [ ] In this case the correct code for rejected specimen is `RI - Identification Problem`
  - Test Order Accuracy: Percent of test orders correctly entered into a laboratory computer
    - Though manual entry of orders is expected to be rare, the [QuestionnaireResponse](https://app.medplum.com/QuestionnaireResponse) resource is the source of truth for manual order entries.
  - Specimen Acceptability: Percent of specimens received that are suitable for testing
    - [ ] All [Specimens](https://app.medplum.com/Specimen)
    - [ ] [Unsatisfactory Specimens](https://app.medplum.com/Specimen?_count=20&_fields=id,_lastUpdated,status&_offset=0&_sort=-_lastUpdated&status=unsatisfactory)
  - Test Turnaround Time: Collection-to-reporting turnaround time or receipt-in- laboratory-to-reporting turnaround time of tests ordered. This may include orders of a “stat” priority (eg, emergency department or intensive care unit specimens), or routine priority, to include the percent of specimens with turnaround time that falls within an established limit (eg, the time that represents the 90th or 95th percentile of turnaround times or less than 30 minutes).
    - [ ] Collection-to-reporting turnaround: [Specimen.collection.collectedDateTime](https://app.medplum.com/Specimen?_count=20&_fields=id,_lastUpdated,condition,collection&_offset=0&_sort=-_lastUpdated) to [DiagnosticReport.issued](https://app.medplum.com/DiagnosticReport?_count=20&_fields=id,_lastUpdated,subject,code,status,specimen,issued&_offset=0&_sort=-_lastUpdated)
    - [ ] Receipt-in-laboratory-to-reporting turnaround: [Specimen.receivedTime](https://app.medplum.com/Specimen?_count=20&_fields=id,_lastUpdated,receivedTime&_offset=0&_sort=-_lastUpdated) to [DiagnosticReport.issued](https://app.medplum.com/DiagnosticReport?_count=20&_fields=id,_lastUpdated,subject,code,status,specimen,issued&_offset=0&_sort=-_lastUpdated)
    - You can construct a [GraphQL Query](https://graphiql.medplum.com/?query=ewogIERpYWdub3N0aWNSZXBvcnRDb25uZWN0aW9uKAogICAgaXNzdWVkOiAiZ3QyMDIzLTAyLTAxIgogICAgX2NvdW50OiAxMDAKICApIHsKICAgIGNvdW50CiAgICBlZGdlcyB7CiAgICAgIHJlc291cmNlIHsKICAgICAgICBpZAogICAgICAgIGlzc3VlZAogICAgICAgIGNhdGVnb3J5IHsKICAgICAgICAgIGNvZGluZyB7CiAgICAgICAgICAgIGNvZGUKICAgICAgICAgIH0KICAgICAgICB9CiAgICAgICAgY29kZSB7CiAgICAgICAgICBjb2RpbmcgewogICAgICAgICAgICBjb2RlCiAgICAgICAgICB9CiAgICAgICAgfQogICAgICAgIHNwZWNpbWVuIHsKICAgICAgICAgIHJlc291cmNlIHsKICAgICAgICAgICAgLi4uIG9uIFNwZWNpbWVuIHsKICAgICAgICAgICAgICBjb2xsZWN0aW9uIHsKICAgICAgICAgICAgICAgIGNvbGxlY3RlZERhdGVUaW1lCiAgICAgICAgICAgICAgfQogICAgICAgICAgICAgIHJlY2VpdmVkVGltZQogICAgICAgICAgICB9CiAgICAgICAgICB9IAogICAgICAgIH0KICAgICAgICBzdWJqZWN0IHsKICAgICAgICAgIHJlc291cmNlIHsKICAgICAgICAgICAgLi4uIG9uIFBhdGllbnQgewogICAgICAgICAgICAgIGlkCiAgICAgICAgICAgICAgZ2VuZGVyCiAgICAgICAgICAgICAgYWRkcmVzcyB7CiAgICAgICAgICAgICAgICBzdGF0ZQogICAgICAgICAgICAgIH0KICAgICAgICAgICAgfQogICAgICAgICAgfQogICAgICAgIH0KICAgICAgfQogICAgfQogIH0KfQ%3D%3D&variables=&operationName=) to query the system for these timestamps.
  - Critical Result Reporting: Percent of critical results with written record that results have been reported to caregivers; percent of critical results for which the primary clinician cannot be contacted in a reasonable period of time
    - [ ] Patient contact are often implemented as [Communication](https://app.medplum.com/Communication?_count=20&_fields=id,_lastUpdated,status,subject,sender,payload&_offset=0&_sort=-_lastUpdated)
    - [ ] Reason for outreach often represented in [CommunicationRequest.reasonReference](https://app.medplum.com/CommunicationRequest?_count=20&_fields=id,_lastUpdated,reasonReference&_offset=0&_sort=-_lastUpdated)
    - [ ] [CommunicationRequests](https://app.medplum.com/CommunicationRequest?_count=20&_fields=id,_lastUpdated,reasonReference,status&_offset=0&_sort=-_lastUpdated&status:contains=completed) that have been completed.

- GEN.43837 Downtime Result Reporting Phase II
  - [ ] Customer Satisfaction: Standardized satisfaction survey tool with a reference database of physician, nurse, or patient respondents. These will often be among [QuestionnaireResponse](https://app.medplum.com/QuestionnaireResponse)
- Corrected Reports – General Laboratory: Percent of reports that are corrected Amended Reports
  - [ ] Corrected/Amended [DiagnosticReports](https://app.medplum.com/DiagnosticReport?status=corrected,ammended)
- Blood Culture Contamination: Percent of blood cultures that grow bacteria that are highly likely to represent contaminants
  - [ ] The main field for recording issues is [Specimen.condition](https://app.medplum.com/Specimen?_count=20&_fields=id,_lastUpdated,condition&_offset=0&_sort=-_lastUpdated) should include codes from the [`SpecimenRejectionReason` code system](https://terminology.hl7.org/CodeSystem-v2-0490.html).
    - [ ] In this case the correct code for rejected specimen is `RN - Contamination`
- Laboratory Test Utilization: Percent of tests (or a test) that appear to be redundant, excessive or noncontributory to good patient care.

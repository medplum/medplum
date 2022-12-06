---
sidebar_position: 2
---

# ONC Certification

:::caution Note

This section is under construction.

:::

The following materials are related to ONC Certification.

## Materials and Usage

| Resource Name                 | Description                                          | Access                                                                                                                                                        |
| ----------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Checklist                     | Checklist for certification                          | [Request Access](https://docs.google.com/spreadsheets/d/1c4-Rd6_tveid-qrkPDZmD1FaA-fRQSI-/edit?usp=sharing&ouid=115651930576812038339&rtpof=true&sd=true)     |
| Decision Guide                | Decision framework for which certification to pursue | [Request Access](https://chpl.healthit.gov/#/search)                                                                                                          |
| Certified Product List (CHPL) | Search tool for certified products                   | [HealthIT.gov](https://chpl.healthit.gov/#/search)                                                                                                            |
| ONC 2015E Cures Base EHR      | Requirements for a basic EHR per Cures Act           | [HealthIT.gov](https://www.healthit.gov/topic/certification-ehrs/2015-edition-test-method/2015-edition-cures-update-base-electronic-health-record-definition) |
| CMS-specific CEHRT            | Certification for CMS reimbursement                  | [CMS.gov](https://www.cms.gov/Regulations-and-Guidance/Legislation/EHRIncentivePrograms/Certification)                                                        |
| Reference Implementation      | Sample EHR code                                      | [Github](https://github.com/medplum/foomedical-provider)                                                                                                      |
| Account Setup                 | Example account setup bot                            | [Github](https://github.com/medplum/medplum-demo-bots/blob/main/src/examples/sample-account-setup.ts)                                                         |
| CMS Queries                   | CMS reportable metrics                               | [Request Access](https://docs.google.com/spreadsheets/d/1OoEcFjiHXHfnZn0y3eQ5D7hjijpr0dop5ckEwnOnSmo/edit#gid=0)                                              |
| EHR Definition                | Description of what defines an EHR                   | [ecfr.gov](https://www.ecfr.gov/current/title-45/subtitle-A/subchapter-D/part-170/subpart-A/section-170.102)                                                  |

## Criteria Shortlist

This is the list of criteria that are already complete or are in active development. Related to this criteria these scripts are for the [Medplum team only](https://drive.google.com/drive/folders/1dvb1FWq_qQ94aBe5SRlxF-3_q04M6gFJ?usp=share_link).

| Criteria                                                                      | Description                                                   |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------- |
| [a1](#cpoe-medication-a1)                                                     | Computerized Provider Order Entry (CPOE) - Medication         |
| [a2](#cpoe-laboratory-a2)                                                     | CPOE - Laboratory Orders                                      |
| [a3](#cpoe-imaging-a3)                                                        | Computerized Provider Order Entry (CPOE) – Diagnostic Imaging |
| [d1](#authentication-access-control-authorization-d1)                         | Authentication, Access Control, Authorization                 |
| [d2](#auditable-events-and-tamper-resistant-d2)                               | Auditable events and tamper resistant                         |
| [d10](#auditing-actions-on-health-information-d10)                            | Auditing actions on Health Information                        |
| [d12](#encrypt-authentication-credentials-d12)                                | Encrypt Authentication Credentials                            |
| [d13](#multi-factor-authentication-d13)                                       | Multi-factor Authentication                                   |
| [g4](#quality-management-system-g4)                                           | Quality Management System                                     |
| [g5](#accessibility-centered-design-g5)                                       | Accessibility-Centered Design                                 |
| [g10](#standardized-api-for-patient-and-population-services-cures-update-g10) | Standardized API for Patient and Population Services          |

The following criteria are required for CHPL listing: [d12](#encrypt-authentication-credentials-d12), [d13](#multi-factor-authentication-d13), [g4](#quality-management-system-g4), [g5](#accessibility-centered-design-g5).

## Criteria Extended List

This is the list of criteria extended criteria that will follow the above.

| Criteria                                               | Description                                   |
| ------------------------------------------------------ | --------------------------------------------- |
| [a9](#clinical-decision-support-a9)                    | Clinical Decision Support                     |
| [a14](#implantable-device-list-a14)                    | Implantable device list                       |
| [b1](#transition-of-care-b1)                           | Transition of Care                            |
| [c1](#clinical-quality-measures--record-and-export-c1) | Clinical Quality Measures - record and export |
| [g7](#application-access--patient-selection-g7)        | Application Access Patient Selection          |
| [g9](#application-access--all-data-request-g9)         | Application Access All Data Request           |
| [h1](#direct-project-edge-protocol-and-xdrxdm-h1)      | Direct Project, Edge Protocol and XDR/XDM     |

## Self-Attested Criteria

### CPOE Medication (a1)

Medplum attests to this criteria, links provided below.

- [Medplum App CPOE Medication](https://app.medplum.com/MedicationRequest/new)
- [Medplum App Medication Requests](https://app.medplum.com/MedicationRequest)
- [HealthIT.gov Reference Material](https://www.healthit.gov/test-method/computerized-provider-order-entry-cpoe-medications)

### CPOE Laboratory (a2)

Medplum attests to this criteria, links provided below.

- [Medplum App CPOE Lab](https://app.medplum.com/ServiceRequest/new)
- [Medplum App Service Requests](https://app.medplum.com/ServiceRequest)
- [HealthIT.gov Reference Material](https://www.healthit.gov/test-method/computerized-provider-order-entry-cpoe-laboratory)

### CPOE Imaging (a3)

Medplum attests to this criteria, links provided below.

- [HealthIT.gov Reference Material](https://www.healthit.gov/test-method/computerized-provider-order-entry-cpoe-diagnostic-imaging)
- [Medplum App CPOE Imaging](https://app.medplum.com/ImagingStudy/new)

### Drug-drug, Drug-allergy Interaction Checks (a4)

- Not included in ONC 2015E Cures Base EHR

### Demographics (a5)

- [HealthIT.gov Reference Material](https://www.healthit.gov/test-method/demographics)
- [Medplum App New Patient](https://app.medplum.com/Patient/new)

### Clinical Decision Support (a9)

- [HealthIT.gov Reference Material](https://www.healthit.gov/test-method/clinical-decision-support-cds)
- [Medplum App Medical Conditions](https://app.medplum.com/Condition)
- [Medplum App Allergies](https://app.medplum.com/AllergyIntolerance)
- [Medplum App Medication](https://app.medplum.com/MedicationRequest)
- [Account Setup Bot](https://github.com/medplum/medplum-demo-bots/blob/main/src/examples/sample-account-setup.ts) shows a sample implementation on how CDS can be integrated.

### Drug-Formulary Checks (a10)

- Not included in ONC 2015E Cures Base EHR

### Family Health History (a12)

- [HealthIT.gov Reference Material](https://www.healthit.gov/test-method/family-health-history)
- [Medplum App - Related Person](https://app.medplum.com/RelatedPerson/new)
- [Family Health History Questionnaire](https://storybook.medplum.com/?path=/docs/medplum-questionnaireform--us-surgeon-general-family-health-portrait)

### Patient-specific Education Resources (a13)

- Not included in ONC 2015E Cures Base EHR

### Implantable Device List (a14)

- [HealthIT.gov Reference Material](https://www.healthit.gov/test-method/implantable-device-list)
- [Medplum App New Device](https://app.medplum.com/Device/new)

### Social, Psychological, and Behavioral Data (a15)

- Not included in ONC 2015E Cures Base EHR
- Implementation via Medplum Questionnaires ([tutorial here](https://www.medplum.com/docs/bots/bot-for-questionnaire-response))

### EHI Export (b10)

- Not included in ONC 2015E Cures Base EHR

### Authentication, Access Control, Authorization (d1)

Medplum attests to this criteria. Links provided below.

- The ability to authenticate the user (authentication)
- Ability to establish permitted user access (authorization)
- Related Materials: [Overview](/docs/auth)
- Related Materials: [Access Policies](/docs/auth/access-control)
- Related Materials: [Inviting a user](/docs/app/invite)

### Auditable Events and Tamper Resistant (d2)

Medplum attests to this criteria. Links and description provided below.

- Demonstrates synchronization to a configured NTP server through use of Amazon Time Sync Service.
- Audit log records actions related to electronic health information, audit log status, and encryption status.
- Audit log records the audit log status and/or the encryption status.
- Audit logging is based off of [AuditEvent](/docs/api/fhir/resources/auditevent) FHIR resources which are written to AWS CloudWatch, write to which is limited to the Medplum team only and to which access and edits are logged.
- [Audit Log Link](https://app.medplum.com/AuditEvent) on Medplum app
- Related Material: [Amazon Time Sync Service](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/set-time.html)
- Related Material: [Audit Log Commits and Issues on Github](https://github.com/medplum/medplum/issues?q=label%3Aaudit-logging+)
- Logging - TODO: Tutorial

### Audit Report(s) (d3)

- Not included in ONC 2015E Cures Base EHR

### Amendments (d4)

- Not included in ONC 2015E Cures Base EHR

### Automatic Access Time-Out (d5)

- Not included in ONC 2015E Cures Base EHR

### Emergency Access (d6)

- Not included in ONC 2015E Cures Base EHR

### End-user Device Encryption (d7)

- Not included in ONC 2015E Cures Base EHR
- [Medplum Security](https://www.medplum.com/security)

### Integrity (d8)

- Not included in ONC 2015E Cures Base EHR
- Implemented by Medplum

### Trusted connection (d9)

- Not included in ONC 2015E Cures Base EHR

### Auditing actions on health information (d10)

Medplum attests to this criteria. Links and description provided below.

- Medplum does not support disabling audit logging for end users.
- Medplum uses [Cloudwatch logging](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/data-protection.html), and only Medplum team members have access to the environment which contains the logs.
- [HealthIT.gov Reference Material](https://www.healthit.gov/test-method/auditing-actions-health-information)
- Related Material: [Audit Log Commits and Issues on Github](https://github.com/medplum/medplum/issues?q=label%3Aaudit-logging+)

### Accounting of Disclosures (d11)

- Not included in ONC 2015E Cures Base EHR

### Encrypt Authentication Credentials (d12)

- Medplum attests to this criteria.
- [HealthIT.gov Reference Material](https://www.healthit.gov/test-method/encrypt-authentication-credentials-0)

### Multi-factor Authentication (d13)

Medplum attests to this criteria. Links and description provided below.

- Medplum supports multi-factor authentication through Google single sign on, which you can see on the [signin page](https://app.medplum.com/signin)
- [HealthIT.gov Reference Material](https://www.healthit.gov/test-method/multi-factor-authentication)

### Secure Messaging (e2)

- Not included in ONC 2015E Cures Base EHR
- [Medplum App Create Communication](https://app.medplum.com/Communication/new)

### Patient Health Information Capture (e3)

- [HealthIT.gov Reference Material](https://www.healthit.gov/test-method/patient-health-information-capture)
- [Patient Health Information Questionnaire Example AHCHRSN Screening](https://storybook.medplum.com/?path=/docs/medplum-questionnaireform--ahchrsn-screening)
- [Design a new Questionnaire](https://app.medplum.com/Questionnaire/new)

### Transmit to Public Health Agencies – case reporting (f5)

- Not included in ONC 2015E Cures Base EHR
- Implement using Medplum Bots ([tutorials](https://www.medplum.com/docs/tutorials/bots))

### Safety-enhanced Design (g3)

- Not included in ONC 2015E Cures Base EHR

### Quality Management System (g4)

Medplum attests to this criteria. Medplum practices Agile development.

- Medplum maps Agile development to [ISO 9001](iso9001.md)
- [Guidance on HealthIT.gov](https://www.healthit.gov/test-method/quality-management-system)

### Accessibility-Centered Design (g5)

With regard to application development, no accessibility-centered design standard or law was applied.

- [Guidance on HealthIT.gov](https://www.healthit.gov/test-method/accessibility-centered-design)

### Application Access – Patient Selection (g7)

- [HealthIT.gov Reference Material](https://www.healthit.gov/test-method/application-access-patient-selection)
- [Medplum Terms](https://www.medplum.com/terms)

## Live Tested Criteria

As it relates to Live Testing, these are the resources for [Medplum team only](https://drive.google.com/file/d/1eABY-Bu8ZHpQHfS1JimZ4waHfX1p1EtL/view?usp=sharing).

### Transition of Care (b1)

- [HealthIT.gov Reference Material](https://www.healthit.gov/test-method/transitions-care)
- TODO: CCD-A Import and Export

### Clinical Information Reconciliation and Incorporation (b2)

- Not included in ONC 2015E Cures Base EHR

### Electronic Prescribing (b3)

- Not included in ONC 2015E Cures Base EHR

### Care Plan (b9)

- [Medplum App CarePlan](https://app.medplum.com/CarePlan)
- [Medplum App Request Group](https://app.medplum.com/RequestGroup)
- [Medplum Request Group Example](https://storybook.medplum.com/?path=/docs/medplum-requestgroupdisplay--simple)

### Clinical Quality Measures – record and export (c1)

Technical outcome – The health IT must be able to record all data necessary to calculate CQMs presented for certification.

- [HealthIT.gov Reference Material](https://www.healthit.gov/test-method/clinical-quality-measures-cqms-record-and-export)

### Clinical Quality Measures – import and calculate (c2)

- [HealthIT.gov Reference Material](https://www.healthit.gov/test-method/clinical-quality-measures-cqms-import-and-calculate)
- [Medplum App Import Data](https://app.medplum.com/batch)
- [Test FHIR Batch Data for Import](https://drive.google.com/drive/folders/1-tpx7lHSDjc8lG3ZTVox0ndLnbCgx_t2?usp=sharing)

### Clinical Quality Measures - report (c3)

- [HealthIT.gov Reference Material](https://www.healthit.gov/test-method/clinical-quality-measures-cqms-report)

### Clinical Quality Measures – filter (c4)

- Not included in ONC 2015E Cures Base EHR

### View, Download, Transmit to 3rd Party (e1)

This relates to the parsing and handling of CCD-A.

- HealthIT [CCD-A Validation Tool](https://ett.healthit.gov/ett/#/validators/ccdar3)
- Not included in ONC 2015E Cures Base EHR
- Implement using Medplum Bots ([tutorials](https://www.medplum.com/docs/tutorials/bots))

### Transmit to Immunization Registries (f1)

- Not included in ONC 2015E Cures Base EHR
- Implement using Medplum Bots ([tutorials](https://www.medplum.com/docs/tutorials/bots))

### Transmit to Public Health Agencies – syndromic surveillance (f2)

- Not included in ONC 2015E Cures Base EHR
- Implement using Medplum Bots ([tutorials](https://www.medplum.com/docs/tutorials/bots))

### Transmit to Public Health Agencies – reportable laboratory tests (f3)

- Not included in ONC 2015E Cures Base EHR
- Implement using Medplum Bots ([tutorials](https://www.medplum.com/docs/tutorials/bots))

### Transmit to Cancer Registries (f4)

- Not included in ONC 2015E Cures Base EHR
- Implement using Medplum Bots ([tutorials](https://www.medplum.com/docs/tutorials/bots))

### Transmit to Public Health Agencies – antimicrobial use and resistance reporting (f6)

- Not included in ONC 2015E Cures Base EHR
- Implement using Medplum Bots ([tutorials](https://www.medplum.com/docs/tutorials/bots))

### Transmit to Public Health Agencies – health care surveys (f7)

- Not included in ONC 2015E Cures Base EHR
- Implement using Medplum Bots ([tutorials](https://www.medplum.com/docs/tutorials/bots))

### Automated Numerator / Measure Calculation (g1-g2)

- [HealthIT.gov Reference Material](https://www.healthit.gov/test-method/automated-numerator-recording)
- TODO: Need tutorial on constructing queries on [Medplum](https://app.medplum.com)

### Consolidated CDA Creation Performance (g6)

- TODO: Need tutorial on creating and importing a CCDA document

### Application Access – Data Category Request (g8)

- Documentation on [testing files and procedure](https://docs.google.com/document/d/1i9W0U3BlGUuvY_Dm5Phni8GIIeTL2ls7jFxfR57-0eE/edit#bookmark=id.2u6wntf)
- [HealthIT.gov Reference Material](https://www.healthit.gov/test-method/application-access-data-category-request)
- [Related test on Cypress](https://projectcypress.github.io/promoting-interoperability-test-artifacts/exports/test_data/G2_EP_Required_Test_2a_.html)

### Application Access – All Data Request (g9)

- [HealthIT.gov Reference Material](https://www.healthit.gov/test-method/application-access-all-data-request)
- [Related test on Cypress](https://projectcypress.github.io/promoting-interoperability-test-artifacts/exports/test_data/G2_EP_Required_Test_2a_.html)

### Standardized API for Patient and Population Services (Cures Update) (g10)

- Tested via [Inferno](https://inferno.healthit.gov/)
- Detailed guide and [requirements](https://docs.google.com/document/d/1i9W0U3BlGUuvY_Dm5Phni8GIIeTL2ls7jFxfR57-0eE/edit#bookmark=id.28h4qwu)

### Direct Project

- [HealthIT.gov Reference Material](https://www.healthit.gov/test-method/direct-project)
- TODO: Direct message tutorial

### Direct Project, Edge Protocol, and XDR/XDM (h1)

- [HealthIT.gov Reference Material](https://www.healthit.gov/test-method/direct-project)
- TODO: Direct message tutorial

### Access Control

- [HealthIT.gov Reference Material](https://www.healthit.gov/test-method/authentication-access-control-authorization)
- [Medplum Access Control](https://www.medplum.com/docs/auth/access-control)

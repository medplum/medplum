---
sidebar_position: 2
---

# ONC Certification

:::caution Note

This section is under construction.

:::

The following tutorial for building an app that meets the requirements for ONC certification.

## Materials and Usage

The materials below can help you scope your certification program.

| Resource Name            | Description                                          | Access                                                                                                                                                        |
| ------------------------ | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Checklist                | Checklist for certification                          | [Request Access](https://docs.google.com/spreadsheets/d/1c4-Rd6_tveid-qrkPDZmD1FaA-fRQSI-/edit?usp=sharing&ouid=115651930576812038339&rtpof=true&sd=true)     |
| Decision Guide           | Decision framework for which certification to pursue | [Request Access](https://chpl.healthit.gov/#/search)                                                                                                          |
| Certified Product List   | Search tool for certified products                   | [HealthIT.gov](https://chpl.healthit.gov/#/search)                                                                                                            |
| ONC 2015E Cures Base EHR | Requirements for a basic EHR per Cures Act           | [HealthIT.gov](https://www.healthit.gov/topic/certification-ehrs/2015-edition-test-method/2015-edition-cures-update-base-electronic-health-record-definition) |
| CMS-specific CEHRT       | Certification for CMS reimbursement                  | [CMS.gov](https://www.cms.gov/Regulations-and-Guidance/Legislation/EHRIncentivePrograms/Certification)                                                        |
| Reference Implementation | Sample EHR code                                      | [Github](https://github.com/medplum/foomedical-provider)                                                                                                      |
| Account Setup            | Example account setup bot                            | [Github](https://github.com/medplum/medplum-demo-bots/blob/main/src/examples/sample-account-setup.ts)                                                         |
| CMS Queries              | CMS reportable metrics                               | [Request Access](https://docs.google.com/spreadsheets/d/1OoEcFjiHXHfnZn0y3eQ5D7hjijpr0dop5ckEwnOnSmo/edit#gid=0)                                              |

## Checklist

Below is a checklist of criteria for ONC Certification. These are the resources for [Medplum Team Only](https://drive.google.com/file/d/1eABY-Bu8ZHpQHfS1JimZ4waHfX1p1EtL/view?usp=sharing)

The following criteria are required for listing: d12, d13, g4, g5.

## Self-Attested Criteria

### CPOE Medication (a1)

- [HealthIt.gov Reference Material](https://www.healthit.gov/test-method/computerized-provider-order-entry-cpoe-medications)
- [Medplum App CPOE](https://app.medplum.com/MedicationRequest/new)

### CPOE Imaging (a3)

- [HealthIT.gov Reference Material](https://www.healthit.gov/test-method/computerized-provider-order-entry-cpoe-diagnostic-imaging)
- [Medplum App CPOE Imaging](https://app.medplum.com/ImagingStudy/new)

### CPOE Laboratory (a2)

- [Medplum App CPOE Lab](https://app.medplum.com/ServiceRequest/new)
- [Lab order form in account setup](https://github.com/medplum/medplum-demo-bots/blob/main/src/examples/sample-account-setup.ts)

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
- Implementation via Medplum Questionnaires ([tutorial here](https://www.medplum.com/docs/tutorials/bots/bot-for-questionnaire-response))

### EHI Export (b10)

- Not included in ONC 2015E Cures Base EHR

### Authentication, Access Control, Authorization (d1)

- [Overview](https://www.medplum.com/docs/tutorials/authentication-and-security)

### Auditable Events and Tamper Resistant (d2)

- [Audit Events](https://app.medplum.com/AuditEvent)
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

- Not included in ONC 2015E Cures Base EHR
- Implemented by Medplum

### Accounting of Disclosures (d11)

- Not included in ONC 2015E Cures Base EHR

### Encrypt Authentication Credentials (d12)

- Not included in ONC 2015E Cures Base EHR
- Implemented by Medplum

### Multi-factor Authentication (d13)

- Not included in ONC 2015E Cures Base EHR
- Medplum supports Google Authentication

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

- Not included in ONC 2015E Cures Base EHR

### Accessibility-Centered Design (g5)

- Not included in ONC 2015E Cures Base EHR

### Application Access – Patient Selection (g7)

- [HealthIT.gov Reference Material](https://www.healthit.gov/test-method/application-access-patient-selection)
- [Medplum Terms](https://www.medplum.com/terms)

## Live Tested Criteria

### Transition of Care (b1)

- [HealthIT.gov Reference Material](https://www.healthit.gov/test-method/transitions-care)
- TODO: CCD-A Import and Export

### Clinical Information Reconciliation and Incorporation (b2)

- Not included in ONC 2015E Cures Base EHR

### Electronic Prescribing (b3)

- Not included in ONC 2015E Cures Base EHR

### Care Plan (b9)

- Not included in ONC 2015E Cures Base EHR
- [Medplum App CarePlan](https://app.medplum.com/CarePlan)
- [Medplum App Request Group](https://app.medplum.com/RequestGroup)
- [Medplum Request Group Example](https://storybook.medplum.com/?path=/docs/medplum-requestgroupdisplay--simple)

### Clinical Quality Measures – record and export (c1)

Technical outcome – The health IT must be able to record all data necessary to calculate CQMs presented for certification.

- [HealthIT.gov Reference Material](https://www.healthit.gov/test-method/clinical-quality-measures-cqms-record-and-export)
- Medplum stores all data in a FHIR R4 format and therefore implements this criteria. [Aegis Report](https://drive.google.com/file/d/1-uvf4-SSvA96ULn6wxGWHTJmBIiBj8NL/view?usp=sharing)

### Clinical Quality Measures – import and calculate (c2)

- [HealthIT.gov Reference Material](https://www.healthit.gov/test-method/clinical-quality-measures-cqms-import-and-calculate)
- Medplum stores all data in a FHIR R4 format and therefore implements this criteria. [Aegis Report](https://drive.google.com/file/d/1-uvf4-SSvA96ULn6wxGWHTJmBIiBj8NL/view?usp=sharing)
- [Medplum App Import Data](https://app.medplum.com/batch)
- [Test FHIR Batch Data for Import](https://drive.google.com/drive/folders/1-tpx7lHSDjc8lG3ZTVox0ndLnbCgx_t2?usp=sharing)

### Clinical Quality Measures - report (c3)

- [HealthIT.gov Reference Material](https://www.healthit.gov/test-method/clinical-quality-measures-cqms-report)
- Medplum stores all data in a FHIR R4 format and therefore implements this criteria. [Aegis Report](https://drive.google.com/file/d/1-uvf4-SSvA96ULn6wxGWHTJmBIiBj8NL/view?usp=sharing)

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
- [Medplum Access Control](https://www.medplum.com/docs/tutorials/security/access-control)

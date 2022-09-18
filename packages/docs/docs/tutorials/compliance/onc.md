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

| Resource Name  | Description  | Access  |
|---|---|---|
| Checklist  | Checklist for certification  | [Request Access](https://docs.google.com/spreadsheets/d/1c4-Rd6_tveid-qrkPDZmD1FaA-fRQSI-/edit?usp=sharing&ouid=115651930576812038339&rtpof=true&sd=true)  |
| Decision Guide  | Decision framework for which certification to pursue   | [Request Access](https://chpl.healthit.gov/#/search)   |
| Certified Product List  | Search tool for certified products | [HealthIT.gov](https://chpl.healthit.gov/#/search)  |
| ONC 2015E Cures Base EHR  | Requirements for a basic EHR per Cures Act | [HealthIT.gov](https://www.healthit.gov/topic/certification-ehrs/2015-edition-test-method/2015-edition-cures-update-base-electronic-health-record-definition)  |
| CMS-specific CEHRT  | Certification for CMS reimbursement | [CMS.gov](https://www.cms.gov/Regulations-and-Guidance/Legislation/EHRIncentivePrograms/Certification)  |
| Reference Implementation  | Sample EHR code | [Github](https://github.com/medplum/foomedical-provider)  |
| Account Setup  | Example account setup bot | [Github](https://github.com/medplum/medplum-demo-bots/blob/main/src/examples/sample-account-setup.ts)  |

## Checklist

Below is a checklist of criteria for ONC Certification.

## Self-Attested Criteria

### CPOE Medication

- [HealthIt.gov Reference Material](https://www.healthit.gov/test-method/computerized-provider-order-entry-cpoe-medications)
- [Medplum App CPOE](https://app.medplum.com/MedicationRequest/new)

### CPOE Imaging

- [HealthIT.gov Reference Material](https://www.healthit.gov/test-method/computerized-provider-order-entry-cpoe-diagnostic-imaging)
- [Medplum App CPOE Imaging](https://app.medplum.com/ImagingStudy/new)

### CPOE Laboratory

- [Medplum App CPOE Lab](https://app.medplum.com/ServiceRequest/new)
- [Lab order form in account setup](https://github.com/medplum/medplum-demo-bots/blob/main/src/examples/sample-account-setup.ts)

### Drug-drug, Drug-allergy Interaction Checks

- Not included in ONC 2015E Cures Base EHR

### Demographics

- [HealthIT.gov Reference Material](https://www.healthit.gov/test-method/demographics)
- [Medplum App New Patient](https://app.medplum.com/Patient/new)

### Clinical Decision Support

- [HealthIT.gov Reference Material](https://www.healthit.gov/test-method/clinical-decision-support-cds)
- [Medplum App Medical Conditions](https://app.medplum.com/Condition)
- [Medplum App Allergies](https://app.medplum.com/AllergyIntolerance)
- [Medplum App Medication](https://app.medplum.com/MedicationRequest)
- [Account Setup Bot](https://github.com/medplum/medplum-demo-bots/blob/main/src/examples/sample-account-setup.ts) shows a sample implementation on how CDS can be integrated.

### Drug-Formulary Checks

- Not included in ONC 2015E Cures Base EHR

### Family Health History

- [HealthIT.gov Reference Material](https://www.healthit.gov/test-method/family-health-history)
- [Medplum App - Related Person](https://app.medplum.com/RelatedPerson/new)
- [Family Health History Questionnaire](https://storybook.medplum.com/?path=/docs/medplum-questionnaireform--us-surgeon-general-family-health-portrait)

### Patient-specific Education Resources

- Not included in ONC 2015E Cures Base EHR

### Implantable Device List

- [HealthIT.gov Reference Material](https://www.healthit.gov/test-method/implantable-device-list)
- [Medplum App New Device](https://app.medplum.com/Device/new)

### Social, Psychological, and Behavioral Data

- Not included in ONC 2015E Cures Base EHR
- Implementation via Medplum Questionnaires ([tutorial here](https://www.medplum.com/docs/tutorials/bots/bot-for-questionnaire-response))

### EHI Export

- Not included in ONC 2015E Cures Base EHR

### Authentication, Access Control, Authorization

- [Overview](https://www.medplum.com/docs/tutorials/authentication-and-security)

### Auditable Events and Tamper Resistant

- [Audit Events](https://app.medplum.com/AuditEvent)
- Logging - TODO: Tutorial

### Audit Report(s)

- Not included in ONC 2015E Cures Base EHR

### Amendments

- Not included in ONC 2015E Cures Base EHR

### Automatic Access Time-Out

- Not included in ONC 2015E Cures Base EHR

### Emergency Access

- Not included in ONC 2015E Cures Base EHR

### End-user Device Encryption

- Not included in ONC 2015E Cures Base EHR
- [Medplum Security](https://www.medplum.com/security)

### Integrity

- Not included in ONC 2015E Cures Base EHR
- Implemented by Medplum

### Trusted connection

- Not included in ONC 2015E Cures Base EHR

### Auditing actions on health information

- Not included in ONC 2015E Cures Base EHR
- Implemented by Medplum

### Accounting of Disclosures

- Not included in ONC 2015E Cures Base EHR

### Encrypt Authentication Credentials

- Not included in ONC 2015E Cures Base EHR
- Implemented by Medplum

### Multi-factor Authentication

- Not included in ONC 2015E Cures Base EHR
- Medplum supports Google Authentication

### Secure Messaging

- Not included in ONC 2015E Cures Base EHR
- [Medplum App Create Communication](https://app.medplum.com/Communication/new)

### Patient Health Information Capture

- [HealthIT.gov Reference Material](https://www.healthit.gov/test-method/patient-health-information-capture)
- [Patient Health Information Questionnaire Example AHCHRSN Screening](https://storybook.medplum.com/?path=/docs/medplum-questionnaireform--ahchrsn-screening)
- [Design a new Questionnaire](https://app.medplum.com/Questionnaire/new)

### Transmit to Public Health Agencies – case reporting

- Not included in ONC 2015E Cures Base EHR
- Implement using Medplum Bots ([tutorials](https://www.medplum.com/docs/tutorials/bots))

### Safety-enhanced Design

- Not included in ONC 2015E Cures Base EHR

### Quality Management System

- Not included in ONC 2015E Cures Base EHR

### Accessibility-Centered Design

- Not included in ONC 2015E Cures Base EHR

### Application Access – Patient Selection

- [HealthIT.gov Reference Material](https://www.healthit.gov/test-method/application-access-patient-selection)
- [Medplum Terms](https://www.medplum.com/terms)

## Live Tested Criteria

### Transition of Care

- [HealthIT.gov Reference Material](https://www.healthit.gov/test-method/transitions-care)
- TODO: CCD-A Import and Export

### Clinical Information Reconciliation and Incorporation

- Not included in ONC 2015E Cures Base EHR

### Electronic Prescribing

- Not included in ONC 2015E Cures Base EHR

### Care Plan

- Not included in ONC 2015E Cures Base EHR
- [Medplum App CarePlan](https://app.medplum.com/CarePlan)
- [Medplum App Request Group](https://app.medplum.com/RequestGroup)
- [Medplum Request Group Example](https://storybook.medplum.com/?path=/docs/medplum-requestgroupdisplay--simple)

### Clinical Quality Measures – record and export

Technical outcome – The health IT must be able to record all data necessary to calculate CQMs presented for certification.

- [HealthIT.gov Reference Material](https://www.healthit.gov/test-method/clinical-quality-measures-cqms-record-and-export)
- Medplum stores all data in a FHIR R4 format and therefore implements this criteria.  [Aegis Report](https://drive.google.com/file/d/1-uvf4-SSvA96ULn6wxGWHTJmBIiBj8NL/view?usp=sharing)

### Clinical Quality Measures – import and calculate

- [HealthIT.gov Reference Material](https://www.healthit.gov/test-method/clinical-quality-measures-cqms-import-and-calculate)
- Medplum stores all data in a FHIR R4 format and therefore implements this criteria.  [Aegis Report](https://drive.google.com/file/d/1-uvf4-SSvA96ULn6wxGWHTJmBIiBj8NL/view?usp=sharing)
- [Medplum App Import Data](https://app.medplum.com/batch)
- [Test FHIR Batch Data for Import](https://drive.google.com/drive/folders/1-tpx7lHSDjc8lG3ZTVox0ndLnbCgx_t2?usp=sharing)

### Clinical Quality Measures - report

- [HealthIT.gov Reference Material](https://www.healthit.gov/test-method/clinical-quality-measures-cqms-report)
- Medplum stores all data in a FHIR R4 format and therefore implements this criteria.  [Aegis Report](https://drive.google.com/file/d/1-uvf4-SSvA96ULn6wxGWHTJmBIiBj8NL/view?usp=sharing)

### Clinical Quality Measures – filter

- Not included in ONC 2015E Cures Base EHR

### View, Download, Transmit to 3rd Party

- Not included in ONC 2015E Cures Base EHR
- Implement using Medplum Bots ([tutorials](https://www.medplum.com/docs/tutorials/bots))

### Transmit to Immunization Registries

- Not included in ONC 2015E Cures Base EHR
- Implement using Medplum Bots ([tutorials](https://www.medplum.com/docs/tutorials/bots))

### Transmit to Public Health Agencies – syndromic surveillance

- Not included in ONC 2015E Cures Base EHR
- Implement using Medplum Bots ([tutorials](https://www.medplum.com/docs/tutorials/bots))

### Transmit to Public Health Agencies – reportable laboratory tests

- Not included in ONC 2015E Cures Base EHR
- Implement using Medplum Bots ([tutorials](https://www.medplum.com/docs/tutorials/bots))

### Transmit to Cancer Registries

- Not included in ONC 2015E Cures Base EHR
- Implement using Medplum Bots ([tutorials](https://www.medplum.com/docs/tutorials/bots))

### Transmit to Public Health Agencies – antimicrobial use and resistance reporting

- Not included in ONC 2015E Cures Base EHR
- Implement using Medplum Bots ([tutorials](https://www.medplum.com/docs/tutorials/bots))

### Transmit to Public Health Agencies – health care surveys

- Not included in ONC 2015E Cures Base EHR
- Implement using Medplum Bots ([tutorials](https://www.medplum.com/docs/tutorials/bots))

### Automated Numerator / Measure Calculation

- [HealthIT.gov Reference Material](https://www.healthit.gov/test-method/automated-numerator-recording)
- TODO: Need tutorial on constructing queries on [Medplum](https://app.medplum.com)

### Consolidated CDA Creation Performance

- TODO: Need tutorial on creating and importing a CCDA document

### Application Access – Data Category Request

- [HealthIT.gov Reference Material](https://www.healthit.gov/test-method/application-access-data-category-request)
- [Medplum FHIR API](https://www.medplum.com/docs/api/fhir/resources)
- [Medplum Client Credentials](https://app.medplum.com/admin/clients)

### Application Access – All Data Request

- [HealthIT.gov Reference Material](https://www.healthit.gov/test-method/application-access-all-data-request)
- [Medplum FHIR API](https://www.medplum.com/docs/api/fhir/resources)
- [Medplum Client Credentials](https://app.medplum.com/admin/clients)

### Direct Project

- [HealthIT.gov Reference Material](https://www.healthit.gov/test-method/direct-project)
- TODO: Direct message tutorial

### Direct Project, Edge Protocol, and XDR/XDM

- [HealthIT.gov Reference Material](https://www.healthit.gov/test-method/direct-project)
- TODO: Direct message tutorial

### Access Control

- [HealthIT.gov Reference Material](https://www.healthit.gov/test-method/authentication-access-control-authorization)
- [Medplum Access Control](https://www.medplum.com/docs/tutorials/security/access-control)

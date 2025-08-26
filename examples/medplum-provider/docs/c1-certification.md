# ONC C1 Certification (315.c.1) - Record and Export

This document covers the ONC C1 certification (315.c.1) - Record and Export capability for Medplum to achieve Base EHR designation. This demonstrates the ability to record patient data according to CQM measure data elements, then export as QRDA Cat I XML files for the measure CMS eCQM 68 - Documentation of Current Medications in the Medical Record.

## Workflow Overview

The C1 certification workflow consists of two main steps:

1. **Data Entry**: Use the patient intake form to enter test patient data. This creates Patient resources and associated FHIR resources (Encounters, Procedures, etc.) in your Medplum project.

2. **QRDA Export**: Use the bulk certification feature in the patient list to generate QRDA Cat I XML files for the CMS eCQM 68 measure. This exports patient data in the format required for ONC certification testing.

## Getting Started

See the [main README](../README.md#getting-started) for installation and setup instructions.

## Bots

| Bot Name                | Description                                                                                       |
| ----------------------- | ------------------------------------------------------------------------------------------------- |
| `c1-patient-intake-bot` | Creates resources based on the patient record.                                                    |
| `c1-certification-bot`  | Generates QRDA Cat I XML files for ONC C1 certification (315.c.1) - Record and Export capability. |

## Core Data

The value sets for the measure can be found in the following sources:

- [Documentation of Current Medications in the Medical Record](https://ecqi.healthit.gov/ecqm/ec/2025/cms0068v14?qt-tabs_measure=specifications-and-data-elements)
- [VSAC - eCQM Update 2024-05-02 : "CMS68v14"](https://vsac.nlm.nih.gov/valueset/expansions?pr=ecqm&rel=eCQM%20Update%202024-05-02&q=CMS68v14)

## QRDA Cat I Data Elements Mapping

This section documents the mapping between patient data elements collected in the application and their inclusion in the generated QRDA Category I XML files. The QRDA (Quality Reporting Document Architecture) Cat I format is used for reporting individual patient-level quality measures to CMS and other quality reporting programs.

The table below shows which data elements from the patient intake form and system-generated records are successfully propagated to the QRDA Cat I XML output, enabling compliance with ONC C1 certification requirements for the CMS eCQM 68 measure.

| Data Element                     | Source (Patient Record) | Output (QRDA file) | FHIR Resource Mapping                            | VSAC ValueSet                    |
| -------------------------------- | ----------------------- | ------------------ | ------------------------------------------------ | -------------------------------- |
| **Patient Demographics**         |                         |                    |                                                  |                                  |
| First Name                       | Intake Form             | ✅                 | `Patient.name.given[0]`                          |                                  |
| Last Name                        | Intake Form             | ✅                 | `Patient.name.family`                            |                                  |
| Date of Birth                    | Intake Form             | ✅                 | `Patient.birthDate`                              |                                  |
| Gender Identity                  | Intake Form             | ✅                 | `Patient.gender`                                 | `2.16.840.1.113762.1.4.1`        |
| Race                             | Intake Form             | ✅                 | `Patient.extension`                              | `2.16.840.1.114222.4.11.836`     |
| Ethnicity                        | Intake Form             | ✅                 | `Patient.extension`                              | `2.16.840.1.114222.4.11.837`     |
| **Contact Information**          |                         |                    |                                                  |                                  |
| Street Address                   | Intake Form             | ✅                 | `Patient.address.line[0]`                        |                                  |
| City                             | Intake Form             | ✅                 | `Patient.address.city`                           |                                  |
| State                            | Intake Form             | ✅                 | `Patient.address.state`                          |                                  |
| Zip Code                         | Intake Form             | ✅                 | `Patient.address.postalCode`                     |                                  |
| Country                          | Intake Form             | ✅                 | `Patient.address.country`                        |                                  |
| Phone Number                     | Intake Form             | ✅                 | `Patient.telecom`                                |                                  |
| Email Address                    | Intake Form             | ✅                 | `Patient.telecom`                                |                                  |
| **Identifiers**                  |                         |                    |                                                  |                                  |
| Patient Identifier               | Intake Form             | ✅                 | `Patient.identifier`                             |                                  |
| **Encounters**                   |                         |                    |                                                  |                                  |
| Encounter Description            | Intake Form             | ✅                 | `Encounter.extension`                            |                                  |
| Encounter Code                   | Intake Form             | ✅                 | `Encounter.type`                                 | `2.16.840.1.113883.3.600.1.1834` |
| Encounter Period Start           | Intake Form             | ✅                 | `Encounter.period.start`                         |                                  |
| Encounter Period End             | Intake Form             | ✅                 | `Encounter.period.end`                           |                                  |
| Encounter Diagnosis              | Intake Form             | ✅                 | `Encounter.diagnosis.condition`                  |                                  |
| Encounter Diagnosis Rank         | Intake Form             | ✅                 | `Encounter.diagnosis.rank`                       |                                  |
| Encounter Discharge Disposition  | Intake Form             | ✅                 | `Encounter.hospitalization.dischargeDisposition` |                                  |
| Encounter Length of Stay         | System Generated        | ❌                 | `Encounter.length`                               |                                  |
| Encounter Status                 | System Generated        | ✅                 | `Encounter.status`                               |                                  |
| **Interventions**                |                         |                    |                                                  |                                  |
| Intervention Description         | Intake Form             | ✅                 | `Procedure.code`                                 |                                  |
| Intervention Code                | Intake Form             | ✅                 | `Procedure.code`                                 |                                  |
| Intervention Relevant Date/Time  | Intake Form             | ✅                 | `Procedure.performedDateTime`                    |                                  |
| Intervention Author Date/Time    | Intake Form             | ✅                 | `Procedure.performedPeriod.start`                |                                  |
| Intervention Negation Reason     | Intake Form             | ✅                 | `Procedure.statusReason`                         | `2.16.840.1.113883.3.526.3.1007` |
| **Procedures**                   |                         |                    |                                                  |                                  |
| Procedure Description            | Intake Form             | ✅                 | `Procedure.code`                                 |                                  |
| Procedure Code                   | Intake Form             | ✅                 | `Procedure.code`                                 |                                  |
| Procedure Relevant Date/Time     | Intake Form             | ✅                 | `Procedure.performedDateTime`                    |                                  |
| Procedure Author Date/Time       | Intake Form             | ✅                 | `Procedure.performedPeriod.start`                |                                  |
| Procedure Negation Reason        | Intake Form             | ✅                 | `Procedure.statusReason`                         | `2.16.840.1.113883.3.526.3.1007` |
| Procedure Rank                   | Intake Form             | ✅                 | `Procedure.extension`                            |                                  |
| **Payer Information**            |                         |                    |                                                  |                                  |
| Source of Payment Typology       | Intake Form             | ✅                 | `Coverage.type`                                  | `2.16.840.1.114222.4.11.3591`    |
| Relevant Period Start            | Intake Form             | ✅                 | `Coverage.period.start`                          |                                  |
| **General Document Information** |                         |                    |                                                  |                                  |
| Document Identifier              | System Generated        | ✅                 |                                                  |                                  |
| Document Generation Time         | System Generated        | ✅                 |                                                  |                                  |
| Language Code                    | System Generated        | ✅                 |                                                  |                                  |
| Confidentiality Code             | System Generated        | ✅                 |                                                  |                                  |

**Legend:**

- ✅ = Included in QRDA Cat I XML
- ❌ = Not included in QRDA Cat I XML

## Cypress Testing and Certification Process

The [Cypress test tool](https://cypress.healthit.gov/) is the official testing platform for ONC EHR certification, including the 315.c.1 (Record and Export) criterion. This section outlines the process for testing the QRDA generator with Cypress to achieve certification.

### Overview of Cypress

Cypress is the open-source testing tool for Electronic Health Records (EHRs) and EHR modules in calculating eCQMs used by CMS's Promoting Interoperability programs. It serves as the official testing tool for the EHR Certification program supported by the Office of the National Coordinator for Health IT (ONC).

### Testing Process for 315.c.1 Certification

To achieve certification for 315.c.1 with a measure like CMS eCQM 68 (Documentation of Current Medications in the Medical Record), follow these steps:

#### Step 1: Test Deck Preparation

- Drummond Group (or the chosen ONC-Authorized Testing Lab) creates a test deck in their Cypress test tool
- Input files containing patient data are provided (e.g., `CMS68v14_input.zip`)
- The test deck includes both QRDA format and HTML versions of patient data

#### Step 2: Patient Data Entry

- Take the input files provided by the testing lab
- Enter the patient data into the system using available methods:
  - Electronic input through the application
  - Manual entry via forms
  - API-based data import
  - Other supported methods

#### Step 3: Measure Selection and Export

- Allow users to select the specific measure (eCQM 68 in this case)
- Configure the date range (typically 1 year)
- Export all patients who meet the measure's **Initial Patient Population (IPP)** criteria in QRDA Cat I format
  - The system must correctly identify and filter patients based on IPP criteria
  - The system must recognize and exclude duplicate patients
  - The system must exclude test patients that don't meet the measure criteria

#### Step 4: Validation and Submission

- Send the generated QRDA Cat I files to the testing lab
- The lab uploads the files into Cypress for validation
- If validation is successful, the certification test is passed

### Testing the QRDA Generator

To test the QRDA generator with this application:

1. **Prepare Test Data**: Use the patient intake forms to create test patients that match the Cypress test deck requirements
2. **Export QRDA Files**: Use the bulk certification feature to export QRDA Cat I files for the specified measure and date range
3. **Validate Output**: Compare the generated QRDA files against the expected output format
4. **Submit for Testing**: Send the files for Cypress validation

### Example Test Data

The `data/example` directory contains a subset of a Cypress test deck that demonstrates the workflow for ONC C1 certification testing. This directory includes:

- **HTML files** (`data/example/html/`): These are the patient test records provided by Cypress in HTML format. Each HTML file contains detailed patient information including demographics, encounters, procedures, and such, that should be used as the reference for creating test patients. These files serve as the "source of truth" for what patient data should be created in the system.

- **JSON files** (`data/example/json/`): These are `QuestionnaireResponse` resources that can be used as input for the `c1-patient-intake-bot` to automatically create the corresponding patient and associated FHIR resources in the Medplum project. Each JSON file contains the structured form data that maps to the patient information shown in the corresponding HTML file. Note that the `questionnaire` field is hardcoded and you may need to update it to match the questionnaire you are using in your project.

**Workflow for Testing:**

1. Review the HTML files to understand the expected patient data structure
2. Use the corresponding JSON files as input to the intake bot to create test patients
3. Verify that the created FHIR resources match the expected data from the HTML files
4. Use the bulk certification feature to generate QRDA Cat I XML files for these patients
5. Submit the generated QRDA files to Cypress for validation

## Useful Links

- [Cypress Testing Tool](https://cypress.healthit.gov/)
- [CMS68v14 - Documentation of Current Medications in the Medical Record](https://ecqi.healthit.gov/ecqm/ec/2025/cms0068v14)
- [Medplum CQM Strategy](https://docs.google.com/document/d/1cZ9gPCAykwoOERWZvhJnJDoyYwFkY6XO/edit)

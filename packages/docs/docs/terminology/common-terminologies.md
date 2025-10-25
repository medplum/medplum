# Commonly Used Terminologies

This guide provides a comprehensive reference for the most commonly used code systems and valuesets in healthcare applications. Each section includes the FHIR `system` URLs needed for proper coding in FHIR resources.

## Overview of Common Code Systems

The following table shows the most commonly used code system for each clinical application area:

| Clinical Application             | Primary Code System | CodeSystem URL                                | Description                                                     | Full System Valueset                             |
| -------------------------------- | ------------------- | --------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------ |
| Clinical Findings                | LOINC               | `http://loinc.org`                            | Laboratory tests, vital signs, clinical observations            | `http://loinc.org/vs`                            |
| Medications                      | RXNorm              | `http://www.nlm.nih.gov/research/umls/rxnorm` | Normalized medication names                                     | `http://www.nlm.nih.gov/research/umls/rxnorm/vs` |
| Procedures                       | CPT                 | `http://www.ama-assn.org/go/cpt`              | Current Procedural Terminology                                  | `http://www.ama-assn.org/go/cpt/vs`              |
| Diagnoses                        | ICD-10-CM           | `http://hl7.org/fhir/sid/icd-10-cm`           | International Classification of Diseases, Clinical Modification | `http://hl7.org/fhir/sid/icd-10-cm/vs`           |
| Vaccines                         | CVX                 | `http://hl7.org/fhir/sid/cvx`                 | Vaccine Administered                                            | `http://hl7.org/fhir/sid/cvx/vs`                 |
| Allergies (food + environmental) | SNOMED CT           | `http://snomed.info/sct`                      | Substance and clinical concepts                                 | `http://snomed.info/sct/vs`                      |

## Use-case Specific ValueSets

Each clinical area has predefined sets of codes that cover the most common scenarios you'll encounter. While each clinical area has a primary code system, healthcare applications often need to support multiple coding systems for different use cases.

### Clinical Findings and Laboratory Tests

| Valueset Name      | Description                                                          | Valueset URL                                                           | Example Values                                 | Code Systems |
| ------------------ | -------------------------------------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------- | ------------ |
| Vital Signs Type   | Codes for types of vital sign measurements and clinical observations | `http://hl7.org/fhir/us/core/ValueSet/us-core-vital-signs`             | `[8302-2] Body height`, `[8867-4] Heart rate`, | LOINC        |
| Smoking Status     | Codes for patient smoking status and tobacco use                     | `http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113883.11.20.9.38`    | `[8517006] Ex-smoker`                          | SNOMED CT    |
| Pregnancy Status   | Codes for pregnancy status and related observations                  | `http://hl7.org/fhir/us/core/ValueSet/us-core-pregnancy-status`        | `[77386006] Pregnancy`                         | SNOMED CT    |
| SDOH Assessment    | Social determinants of health assessment codes                       | `http://hl7.org/fhir/us/core/ValueSet/us-core-common-sdoh-assessments` | `[71802-3]	Housing status`                      | LOINC        |
| Sexual Orientation | Codes for sexual orientation and gender identity                     | `http://hl7.org/fhir/us/core/ValueSet/us-core-sexual-orientation`      | `[20430005] 	Heterosexual`                      | SNOMED CT    |

### Allergies and Adverse Reactions

Allergy coding uses SNOMED CT for substance identification and RXNorm for medication allergies, following US Core 5.0.1 specifications.

| Code System | System URL                                    | Description                     | Use Cases                                                  |
| ----------- | --------------------------------------------- | ------------------------------- | ---------------------------------------------------------- |
| SNOMED CT   | `http://snomed.info/sct`                      | Substance and clinical concepts | Food allergies, environmental allergies, clinical findings |
| RXNorm      | `http://www.nlm.nih.gov/research/umls/rxnorm` | Medication substances           | Drug allergies, medication intolerances                    |

**Common ValueSets**

| Valueset Name             | Description                                                                       | Valueset URL                                                        | Example Values        | Code Systems      |
| ------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------- | --------------------- | ----------------- |
| US Core Allergy Substance | Common substances for allergy and intolerance documentation including refutations | `http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113762.1.4.1186.8` | `[7980] Penicillin G` | SNOMED CT, RXNorm |

### Medications

For detailed information about medication coding systems including RxNorm and NDC, see [Medication Code Systems](/docs/medications/medication-codes).

### Medical Procedures

Procedure coding varies by setting and purpose, with CPT being primary for billing.

| Code System | System URL                                                 | Description                               | Use Cases                                        |
| ----------- | ---------------------------------------------------------- | ----------------------------------------- | ------------------------------------------------ |
| CPT         | `http://www.ama-assn.org/go/cpt`                           | Current Procedural Terminology            | Billing, procedure documentation                 |
| HCPCS       | `https://www.cms.gov/Medicare/Coding/HCPCSReleaseCodeSets` | Healthcare Common Procedure Coding System | Medicare/Medicaid billing, Value-based care, DME |
| SNOMED CT   | `http://snomed.info/sct`                                   | Clinical procedure concepts               | Clinical documentation, procedure notes          |
| ICD-10-PCS  | `http://www.cms.gov/Medicare/Coding/ICD10`                 | ICD-10 Procedure Coding System            | Hospital inpatient billing                       |

### Diagnoses and Conditions

Diagnosis coding primarily uses ICD-10-CM for standardized disease classification, with SNOMED CT providing more granular clinical concepts preferred in international settings.

| Code System | System URL                          | Description                                                     | Use Cases                                |
| ----------- | ----------------------------------- | --------------------------------------------------------------- | ---------------------------------------- |
| ICD-10-CM   | `http://hl7.org/fhir/sid/icd-10-cm` | International Classification of Diseases, Clinical Modification | Primary diagnoses, billing, epidemiology |
| SNOMED CT   | `http://snomed.info/sct`            | Clinical findings and disorders                                 | Clinical documentation, problem lists    |

### Vaccines and Immunizations

Vaccine coding uses CVX codes for vaccine types and CPT codes for administration procedures.

| Code System | System URL                       | Description                       | Use Cases                                    |
| ----------- | -------------------------------- | --------------------------------- | -------------------------------------------- |
| CVX         | `http://hl7.org/fhir/sid/cvx`    | Vaccine Administered              | Immunization records, vaccine administration |
| CPT         | `http://www.ama-assn.org/go/cpt` | Vaccine administration procedures | Billing for vaccine administration           |

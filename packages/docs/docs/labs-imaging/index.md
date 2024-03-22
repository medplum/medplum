# Labs & Imaging

```mermaid

flowchart RL
    patient[<table><thead><tr><th>Patient</th></tr></thead><tbody><tr><td>Lisa Simpson</td></tr></tbody></table>]
    order[<table><thead><tr><th>ServiceRequest</th></tr></thead><tbody><tr><td>Basic Metabolic Panel</td></tr></tbody></table>]
    specimen[<table><thead><tr><th>Specimen</th></tr></thead><tbody><tr><td>Whole Blood</td></tr><tr><td><em>Collected: 2020-01-01T14:12</em></td></tr></tbody></table>]
    obs1[<table><thead><tr><th>Observation</th></tr></thead><tbody><tr><td>Glucose in Blood</td></tr><tr><td>4.0 mmol/L</td></tr></tbody></table>]
    obs2[<table><thead><tr><th>Observation</th></tr></thead><tbody><tr><td>Urea nitrogen in Blood</td></tr></tbody></table>]
    report[<table><thead><tr><th>DiagnosticReport</th></tr></thead></table>]

    subgraph Order
    order -->|subject| patient
    order -->|specimen| specimen
    end

    subgraph Result
    report -->|result| obs1
    report -->|result| obs2
    report -->|basedOn| order
    obs1 -->|basedOn| order
    obs2 -->|basedOn| order
    end

```

## Key Resources

| **Resource**                                                    | **Description**                                                                                                               |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| [`ServiceRequest`](/docs/api/fhir/resources/servicerequest)     | A record of an order for services such as diagnostic investigations, treatments, or operations to be performed.               |
| [`DiagnosticReport`](/docs/api/fhir/resources/diagnosticreport) | The findings and interpretations of diagnostic tests performed on a patient.                                                  |
| [`Specimen`](/docs/api/fhir/resources/specimen)                 | A record of a sample to be used for analysis.                                                                                 |
| [`Observation`](/docs/api/fhir/resources/observation)           | A structured representation of measurements and simple assertions made about a [`Patient`](/docs/api/fhir/resources/patient). |

## Key Code Systems

| **Code System**                                                | **Description**                                                                                  |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| [UCUM](https://ucum.nlm.nih.gov/)                              | Used to define measurement units on a [`Speciment`](/docs/api/fhir/resources/specimen) resource. |
| [ICD-10](https://www.cdc.gov/nchs/icd/icd10cm_browsertool.htm) | Used to annotate [`Observation`](/docs/api/fhir/resources/observation) resources for tracking.   |
| [SNOMED](https://www.snomed.org/)                              | Used to define [`Specimen`](/docs/api/fhir/resources/specimen) types and retrieval methods.      |
| [LOINC](https://www.medplum.com/docs/careplans/loinc)          | Used to annotate [`Observation`](/docs/api/fhir/resources/observation) resources for tracking.   |

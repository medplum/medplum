**Hiive AI Insights -- Population Health Analytics Requirements**

**Prepared for UBIX Labs**

**1. Objective**

Hiive Health is implementing a population health analytics layer using
UBIX, powered by FHIR-based data (via Medplum and other sources).

The goal is to configure dashboards, reports, and cohorting capabilities
that transform patient-level data into **actionable, real-time insights
tied to care workflows**.

This document outlines the required analytics modules, metrics, and data
mappings needed to support this capability.

**2. Data Model & Inputs**

**Primary Data Source**

-   FHIR R4 (Medplum-based)

-   Data delivered as Bundles (Patient-centric)

**Key FHIR Resources to Support**

UBIX should ingest and normalize the following:

-   **Patient** (demographics, geography)

-   **Encounter** (visit history, utilization)

-   **Observation**

    -   Clinical metrics (e.g., vitals, labs)

    -   Behavioral health (e.g., PHQ-2)

    -   SDOH assessments

-   **Condition** (diagnoses)

-   **MedicationRequest** (active meds)

-   **Immunization**

-   **CareTeam**

-   (Optional/Future): Claims, Procedures, Coverage

**Key Derived Data Elements**

UBIX should compute:

-   Patient age (from birthDate)

-   Visit frequency (encounters per time period)

-   Risk flags (based on observations + conditions)

-   Care gaps (missing expected events)

**3. Required Analytics Modules**

**MODULE 1: Population Overview & Segmentation**

**Purpose:** Understand population composition and distribution

**Key Reports:**

-   Patient counts by:

    -   Age bands (0--18, 18--44, 45--64, 65+)

    -   Gender

    -   Geography (ZIP, state)

-   Active vs inactive patients

-   Patients per provider / facility

**Filters:**

-   Date range

-   Facility / organization

-   Provider

**MODULE 2: Risk Stratification**

**Purpose:** Identify high-risk and rising-risk patients

**Requirements:**\
UBIX should support a configurable **risk scoring model** using:

**Inputs:**

-   Conditions (chronic disease presence)

-   Utilization (encounter frequency)

-   Behavioral health (e.g., PHQ-2 scores)

-   SDOH indicators

-   Age

**Outputs:**

-   Risk score (0--100 or percentile)

-   Risk tiers:

    -   High Risk (top 10--15%)

    -   Rising Risk

    -   Low Risk

**Dashboards:**

-   Patient list by risk tier

-   Risk distribution across population

-   "Top risk drivers" per patient (explainability)

**MODULE 3: Behavioral Health & SDOH Insights**

**Purpose:** Surface non-clinical risk factors impacting outcomes

**Key Metrics:**

-   \% of patients screened for depression

-   \% of patients with positive PHQ-2

-   SDOH prevalence:

    -   Housing instability

    -   Food insecurity

    -   Social isolation

    -   Financial strain

**Reports:**

-   SDOH risk distribution by population segment

-   Correlation:

    -   SDOH vs utilization

    -   SDOH vs risk score

**MODULE 4: Utilization & Operational Analytics**

**Purpose:** Monitor care delivery and system performance

**Key Metrics:**

-   Encounters per patient per month

-   Total encounters by type:

    -   Outpatient

    -   Inpatient

    -   ED (if available)

-   Time between visits

-   Patients with no visits in X months

**Dashboards:**

-   Monthly utilization trends

-   Provider productivity (encounters per provider)

-   Facility comparison

**MODULE 5: Care Quality & Gap Analysis**

**Purpose:** Identify missed or overdue care

**Key Measures:**

-   Preventive care:

    -   Immunization rates (e.g., flu vaccine)

-   Screening compliance (configurable)

-   Chronic condition monitoring (if data available)

**Gap Logic Examples:**

-   No visit in last 6 months

-   No screening recorded in last 12 months

-   Missing immunization

**Outputs:**

-   "Care Gap" patient lists

-   Gap counts by category

**MODULE 6: Cohort Builder (Critical Feature)**

**Purpose:** Enable dynamic segmentation and analysis

**Requirements:**\
UBIX must support a **no-code cohort builder** allowing users to filter
by:

-   Demographics (age, gender, geography)

-   Conditions

-   Observations (e.g., PHQ-2 score thresholds)

-   Utilization (visit frequency)

-   SDOH indicators

-   Risk score / tier

**Example Cohorts:**

-   Patients \>65 with no visit in 6 months

-   Patients with PHQ-2 ≥ 2

-   Smokers with respiratory conditions

-   High SDOH risk + low utilization

**Outputs:**

-   Patient list

-   Aggregate metrics

-   Export capability

**MODULE 7: Predictive Analytics (Phase 2)**

**Purpose:** Forecast risk and utilization

**Models to Support:**

-   Hospitalization risk

-   ED visit likelihood

-   High-cost patient prediction

-   Utilization forecasting

**Outputs:**

-   Risk probability per patient

-   Population-level forecasts

**MODULE 8: Workflow-Triggered Insights (Hiive Differentiator)**

**Purpose:** Move from insight → action

**Requirements:**\
UBIX should support triggering outputs that can be consumed by Hiive
workflows:

**Examples:**

-   Alert when:

    -   Risk score crosses threshold

    -   PHQ-2 increases

    -   Patient misses visit

-   Output lists for:

    -   Outreach campaigns

    -   Care management enrollment

**4. Dashboard Requirements**

UBIX should configure the following **initial dashboards**:

**Dashboard 1: Population Overview**

-   Total patients

-   Demographics breakdown

-   Geographic distribution

**Dashboard 2: At-Risk Patients**

-   High-risk patient list

-   Risk score distribution

-   Risk drivers

**Dashboard 3: Care Gaps**

-   Patients missing visits, screenings, or immunizations

-   Gap categories and counts

**Dashboard 4: Utilization**

-   Encounters over time

-   Visits per patient

-   Provider/facility performance

**Dashboard 5: SDOH & Behavioral Health**

-   PHQ-2 distribution

-   SDOH prevalence

-   Correlation with utilization

**5. Technical Requirements**

**Data Handling**

-   Support FHIR ingestion (batch + incremental)

-   Normalize into analytics-friendly schema

-   Maintain patient-level longitudinal history

**Performance**

-   Near real-time refresh preferred

-   Dashboard load times \< 5 seconds

**Configuration**

-   No-code / low-code metric configuration

-   Custom filters and cohort definitions

**Export**

-   CSV / API access to cohort outputs

**6. Success Criteria**

UBIX implementation will be considered successful when:

-   Users can identify high-risk patients in \< 30 seconds

-   Care gaps are automatically surfaced without manual review

-   Cohorts can be created without engineering support

-   Insights can be tied to downstream workflows (Hiive Care)

**7. Future Enhancements (Optional)**

-   Claims data integration

-   Cost analytics (PMPM, total cost of care)

-   Benchmarking across organizations

-   Integration with TEFCA / external data sources

**8. Summary**

This implementation should position Hiive AI Insights as:

A real-time population intelligence platform that not only identifies
risk and gaps---but enables immediate action within care workflows.

**Primary Contact:**\
Hiive Health Product Team

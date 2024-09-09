# Analytics

When designing a healthcare analytics program, data quality and integrity are critical. To create a robust analytics program, constant monitoring of data quality and can be enabled and will be required to ensure that reports are meaningful and accurate.

The following features should be used in concert to build out an analytics program:

1. Store data in the [FHIR Datastore](/docs/fhir-datastore) with emphasis on standard fields, especially on `Patient`, `Observation` and other common resources.
2. Use [Bots](/docs/bots) and [Subscriptions](/docs/subscriptions) to help maintain quality and correctness in real time, for example, ensuring all `Encounter.type` are is tagged with the appropriate ontology, if not throw an error.
3. Use [Access Policies](/docs/access/access-policies) to secure and de-identify data pipelines for privacy-aware analysis
4. Use [Bots](/docs/bots) to synchronize with common tools, machine learning pipelines and more.

Analytics on healthcare data generally have two broad areas of application: **retroactive analysis** of performance and quality metrics, and **predictive modeling** to make recommendations for future behavior.

Retroactive analysis can be used to measure metrics related to operational efficiency and quality of care. In addition, many payors, including Medicare and Medicaid, provide higher reimbursements to providers who report specific [quality-of-care measures](/docs/compliance/onc#materials-and-usage).

On the predictive side, Clinical Decision Support (CDS) systems encode evidence-based clinical guidelines into rules-based suggestions to guide clinicians. Machine learning can also be used to identify common patterns across patients and care plan recommendations.

## Program Design

When designing your analytics program, it can be useful to consider the following categorization.

| Program Type                                          | Application Area | Implementation Tools                                                                     |
| ----------------------------------------------------- | ---------------- | ---------------------------------------------------------------------------------------- |
| Ad-hoc clinical reports                               | Retrospective    | FHIR Datastore, including [Bulk](/docs/api/fhir/operations/bulk-fhir.mdx) and Batch APIs |
| Healthcare standard reports (e.g. HEDIS, CMS Queries) | Retrospective    | Bots for data quality, dashboard apps to monitor                                         |
| Clinical decision support                             | Prospective      | Bots to produce event driven scores, notifications                                       |
| Machine Learning, predictive modeling                 | Prospective      | Bots to integrate with ML pipelines, TypeScript SDK for dashboarding                     |

## Ad-Hoc Clinical Reports

A common pattern for ad-hoc reports is to first ingest FHIR resources into the data warehouse as raw JSON, and then flatten the relevant fields in a second ETL stage.

Analytics pipelines should use the [FHIR Bulk Data Export API](/docs/api/fhir/operations/bulk-fhir.mdx) to extract FHIR resources into a data lake. The [FHIR Datastore](/docs/fhir-datastore) supports bulk export.

Analytics workflows often require de-identified or redacted data for compliance reasons. [Access Policies](/docs/access/access-policies) are common for this purpose.

For machine learning applications, separate pipelines are recommended for training vs. inference. Training can be done as an offline batch process; inference as a serverless compute operation.

Many healthcare analytics workflows require analyzing patients by cohort. Bots can be used to automatically enroll patients into cohorts using the `Group` resource.

Converting resources to the [Parquet file format](https://gidon-16942.medium.com/apache-parquet-for-hl7-fhir-c23610131f8c) helps support queries that require large aggregates.

## Healthcare Standard Reports

Healthcare standard reports rely on coding systems to classify conditions, procedures, drugs, and outcomes. These codes help create a standardized vocabulary between providers, labs, pharmacies, and payors to streamline operations, billing, and analysis.

The U.S. healthcare system implements a number of different coding standards that have different specializations.

- **RxNorm:** A code system of normalized drug names, organized into a hierarchical ontology to represent generics, branded drugs, single doses and drug packs.
- **LOINC:** Clinical terminology relevant to clinical lab orders and results.
- **SNOMED/ICD-10/CPT/HCPCs:** Multiple code sets used to represent clinical procedures and diagnoses. SNOMED CT serves as a global standard for clinical terminology in a variety of contexts, while CPT, ICD-10, and HCPCS are primarily used for billing insurance.

To help organize these different standards, the NIH maintains the [Unified Medical Language System](https://www.nlm.nih.gov/research/umls/index.html) (UMLS), which provides a unified package with codes and terminologies from all major medical code systems, as well as conceptual maps between the various standards.

In the domain of machine learning and analytics, using standardized codes makes it easier to share knowledge with researchers and leverage existing datasets, models, and clinical guidelines.

Assuming you have standards compliant FHIR, tagged with the appropriate ontologies, standard reports become accessible.

As much as possible, we encourage organizations to constantly evaluate data quality and run reports.

### HEDIS

HEDIS Measures are a standardized set of over 90 metrics used by health plans to measure quality of care. In addition to helping digital health providers identify gaps in care, reporting HEDIS measures can allow providers to qualify for increased payor reimbursements through Pay for Quality or Value Based Care models. [Digital versions](https://store.ncqa.org/hedis-quality-measurement.html) of the HEDIS measures are published in FHIR/CQL format, and having patient data modeled natively as FHIR allows providers to easily compute and report these measures.

### CMS Measures

The Centers for Medicare & Medicaid Services (CMS) requires certain providers to report electronic clinical quality measures (eCQMs) via an EHR system that has been certified by the ONC. CMS publishes [eCQMs in FHIR/CQL format](https://ecqi.healthit.gov/ecqms) to help standardize computation of these measures across EMRs, and they provide the [Cypress tool](https://www.healthit.gov/cypress/index.html) to validate EHR implementations against synthetic patient data.

Related: [eCQM fact sheet 2022](https://www.cms.gov/files/document/2022-ecqm-reporting-requirements.pdf), [List of CQMs](https://docs.google.com/spreadsheets/d/1OoEcFjiHXHfnZn0y3eQ5D7hjijpr0dop5ckEwnOnSmo/edit#gid=0)

## Clinical Decision Support

Clinical Decision Support (CDS) systems encode clinical guidelines into rules-based suggestions to guide clinicians and standardize care. CDS rules can incorporate conditional logic based on patient demographic information and medical history to generate personalized clinical guidelines. CDS Hooks is an emerging standard, built on top of FHIR, that defines REST APIs for clients to request CDS care plans from hosted CDS services. CDS workflows are supported through the PlanDefinition resource (more in [Care Plans](/docs/careplans)). Each plan can then be instantiated as a CarePlan for a patient using the $apply operation. CDS systems are great for helping providers ensure consistent quality of care across individual physicians by providing standardized treatment recommendations and eliminating care gaps.

For simple CDS such as [social determinants of health risk-scoring](https://www.ajmc.com/view/social-determinants-of-health-score-does-it-help-identify-those-at-higher-cardiovascular-risk) or [eGFR](https://www.kidneyfund.org/all-about-kidneys/tests/blood-test-egfr) calculation [bots](/docs/bots) combined with [subscriptions](/docs/subscriptions) are a very fast and pragmatic choice.

## Machine Learning / Predictive Modeling

In addition to rules-based guidelines, machine learning can be used to enhance clinical decision support, flag care gaps, and identify trends.

As mentioned above, best practice is to train ML models offline, and then run inference on streaming data. Bots can be used to run machine learning inference, and standards such as [ONNX](https://onnx.ai/) allow developers to exchange model information between training and runtime environments in a language agnostic format. This means that models can be trained using tools like Pytorch or Tensorflow on GPUs, and deployed in Bots during runtime.

Another best practice for deploying predictive modeling in a clinical setting is to focus on model interpretability. In the our experience, physicians are hesitant to adopt fully-automated, black-box models. Leveraging techniques that allow models to explain why they are making a decision and keeping the physician in control of the final decision can lead to much quicker adoption of ML systems.

In addition to running ML models, Bots can be used to annotate medication and lab orders with reason codes and notes to help guide physicians on why an ML recommendation was made. The FHIR datastore also allows ML developers to build custom visualizations on top of the core data platform to explain their model’s reasoning.

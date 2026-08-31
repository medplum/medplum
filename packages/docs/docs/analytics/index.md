# Analytics

When designing a healthcare analytics program, data quality and integrity are critical. To create a robust analytics program, constant monitoring of data quality and can be enabled and will be required to ensure that reports are meaningful and accurate.

The following features should be used in concert to build out an analytics program:

1. Store data in the [FHIR Datastore](/docs/fhir-datastore) with emphasis on standard fields, especially on `Patient`, `Observation` and other common resources.
2. Use [Bots](/docs/bots) and [Subscriptions](/docs/subscriptions) to help maintain quality and correctness in real time, for example, ensuring all `Encounter.type` is tagged with the appropriate ontology, if not throw an error.
3. Export to a data warehouse for the workloads that aggregate across a whole population. Medplum synchronizes FHIR resources to [Snowflake](/docs/analytics/snowflake), [Amazon Redshift](/docs/analytics/redshift), and other engines that read open Apache Iceberg tables.

Analytics on healthcare data generally have two broad areas of application: **retroactive analysis** of performance and quality metrics, and **predictive modeling** to make recommendations for future behavior.

Retroactive analysis can be used to measure metrics related to operational efficiency and quality of care. In addition, many payors, including Medicare and Medicaid, provide higher reimbursements to providers who report specific [quality-of-care measures](/docs/compliance/onc#materials-and-usage).

On the predictive side, Clinical Decision Support (CDS) systems encode evidence-based clinical guidelines into rules-based suggestions to guide clinicians. Machine learning can also be used to identify common patterns across patients and care plan recommendations.

## Program Design

When designing your analytics program, it can be useful to consider the following categorization.

| Program Type                                          | Application Area | Implementation Tools                                                                                    |
| ----------------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------- |
| Ad-hoc clinical reports                               | Retrospective    | Data Warehouse: [Snowflake](/docs/analytics/snowflake), [Amazon Redshift](/docs/analytics/redshift)     |
| Healthcare standard reports (e.g. HEDIS, CMS Queries) | Retrospective    | Data Warehouse: [Snowflake](/docs/analytics/snowflake), [Amazon Redshift](/docs/analytics/redshift)     |
| Clinical decision support                             | Prospective      | [CDS Hooks](/docs/integration/cds-hooks)                                                                |
| Machine Learning, predictive modeling                 | Prospective      | Data Warehouse combined with [`$ai`](/docs/ai/ai-operation), [MCP](/docs/ai/mcp) and [Bots](/docs/bots) |

## Ad-Hoc Clinical Reports

A common pattern for ad-hoc reports is to first ingest FHIR resources into the data warehouse as raw JSON, and then flatten the relevant fields in a second ETL stage.

Medplum Enterprise can run this synchronization for you on a schedule, writing FHIR resources to open Apache Iceberg tables that Snowflake, Amazon Redshift, Amazon Athena, and other engines read directly. See [Snowflake](/docs/analytics/snowflake) or [Amazon Redshift](/docs/analytics/redshift) for the table layout, query patterns, and how to get set up.

## Healthcare Standard Reports

Healthcare standard reports rely on coding systems to classify conditions, procedures, drugs, and outcomes. These codes help create a standardized vocabulary between providers, labs, pharmacies, and payors to streamline operations, billing, and analysis.

The U.S. healthcare system implements a number of different coding standards that have different specializations. See [Commonly Used Terminologies](/docs/terminology/common-terminologies) for the FHIR `system` URLs and ValueSets behind each one, and [Terminologies and Coded Values](/docs/terminology) for how Medplum stores and expands them.

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

For Medplum-specific endpoint contracts and implementation guidance, see [CDS Hooks](/docs/integration/cds-hooks).

For simple CDS such as [social determinants of health risk-scoring](https://www.ajmc.com/view/social-determinants-of-health-score-does-it-help-identify-those-at-higher-cardiovascular-risk) or [eGFR](https://www.kidneyfund.org/all-about-kidneys/tests/blood-test-egfr) calculation [bots](/docs/bots) combined with [subscriptions](/docs/subscriptions) are a very fast and pragmatic choice.

## Machine Learning and AI

Language models now cover much of what used to need a purpose-trained model: summarizing a chart, extracting structured data from a scanned document, drafting a note for review. Medplum exposes this through the [`$ai` operation](/docs/ai/ai-operation), which calls an LLM through the FHIR API and can return suggested FHIR operations rather than free text. [MCP](/docs/ai/mcp) gives an assistant scoped access to the same datastore, and [AWS Textract and Comprehend Medical](/docs/ai/aws) handle documents and faxes. Purpose-trained models still matter for risk scoring and forecasting, and they run the same way.

Three things decide whether any of this reaches production:

- **Training and evaluation sets come from the warehouse.** Assembling a cohort, holding out a test set, and scoring a model against it are aggregate queries, so they belong in [Snowflake](/docs/analytics/snowflake) or [Amazon Redshift](/docs/analytics/redshift). Inference belongs in a [Bot](/docs/bots), triggered by a [Subscription](/docs/subscriptions) when the resource being scored is written. Enroll the cohort itself with a [Group](/docs/api/fhir/resources/group).
- **Scope what the model can touch.** An AI agent reads and writes through the same API as everything else, so [Access Policies](/docs/access/access-policies) decide what it can see and change. Set that boundary before the agent is useful, not after.
- **Keep the clinician in control.** Physicians are slow to adopt models they cannot interrogate. Write the reasoning where it will actually be read: a [DetectedIssue](/docs/api/fhir/resources/detectedissue), a note on the order, or a `Communication` on the `Task` a reviewer picks up. A recommendation someone can accept or reject gets adopted faster than one that acts on its own.

See [Build with AI on Medplum](/docs/ai) for the full picture.

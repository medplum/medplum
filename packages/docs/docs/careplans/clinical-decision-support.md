---
tags: ['compliance']
keywords: ['clinical decision support', 'onc']
sidebar_position: 6
---

# Clinical Decision Support

Medplum enables building and delivering custom clinical decision support tools for a variety of applications. This guide focuses on the regulated ONC Criteria for Clinical Decision support which is criteria (a)(9) of the HTI criteria on predictive CDS.

The guide will walk through the three major categories of Clinical Decision Support (CDS), as defined by the regulations, and how to enable said CDS on Medplum.

:::warning
Medplum is not currently certified for (a)(9) but is pursuing certification. Contact us at info@medplum.com for details.
:::

## Predictive

Predictive clinical decision support technology is "intended to support decision-making based on algorithms or models that derive relationships from training or example data and then are used to produce an output or outputs related to, but not limited to, prediction, classification, recommendation, evaluation, or analysis.”

Large language model-based clinical decision support tools, as well as tools that use algorithms for risk assessment or triage, fall in the predictive clinical decision support category.

Medplum enables [many implementations](/case-studies) with predictive clinical decision support. Per the HTI final ruling, predictive clinical decision support systems will become regulated in December 2024. Any system certified to g10, b2, f1 or e1 will be required to provide **Insight Reports** as part of maintaining their certification.

The following sections describe best practices to prepare for a predictive clinical decision support certification.

### Training Data

Demonstrating which training data was used to train an algorithm (and keeping a record of the versioning of said data) is part of the certification process. In the context of a Medplum implementation, be prepared to keep all of your training data in a [Medplum project](/docs/auth/user-management-guide#background-user-model) which will show which dataset was used to train the models and that the data is updated (feedback loops).

### Code Systems

It is recommended that data is tagged with UMLS code systems, including [LOINC](/docs/careplans/loinc), SNOMED and RxNorm. For certification, data must conform to [USCDI profiles](/docs/fhir-datastore/understanding-uscdi-dataclasses). Implementations of predictive clinical decision support sometimes include annotating data with code systems using an algorithm or large language model.

### Insights Reporting

Electronic health records that support predictive clinical decision support will be required to report on the usage of their product. Prepare the following basic statistics as part of certification: 
- Number of times the decision support was used
- Number of unique clinicians who used it
- Number of times it was updated
- Number of complaints received

## Linked Referential

Linked referential clinical decision support are hyperlinks that link to reference material that is specific to the clinical context of a specific patient or population. The ONC criteria that define this standard are 170.205(a)(3,4) and relate to the retrieval of context-aware knowledge using the HL7 Infobutton.

:::warning
Medplum is not certified for (a)(3,4) but serves as a basis for those who wish to implement. The Clinical Profile and [Diagnostic Report](https://storybook.medplum.com/?path=/story/medplum-diagnosticreportdisplay--simple) React components serve as common launch points for Infobutton implementations.
:::

To support the linked referential clinical decision support the system should be capable of retrieving information based on one or more of the following data elements. The Clinical Profile React component highlights the data elements.

- Demographic information
- Problems list (Conditions in FHIR)
- Medications
- Smoking status

[UpToDate](https://www.wolterskluwer.com/en/solutions/uptodate/uptodate-advanced/workflow-integration) is a common provider for linked referential data.

## Evidence Based

Evidence-based clinical decision support systems are largely related to medication administration, drug interactions (with other drugs, foods, OTC medications, etc.) and dosing. Evidence-based clinical decision support systems plug into health record systems via SMART-App-Launch links, iFrames or APIs, all of which are supported by Medplum.

Medplum supports a [Smart-App-Launch react component]([Smart App Launch Link](https://storybook.medplum.com/?path=/story/medplum-smartapplaunchlink--basic) react component.
) that serves as a launch point for evidence-based implementations.

[DoseSpot](https://www.dosespot.com/) is a common provider for evidence based medication administration and supports recording and retrieving allergies, listing potential interactions for a specific prescription, listing drug interactions on a patient record, checking for known interactions at prescription creation time.

## Related Reading

- [ONC Certification](/docs/compliance/onc)
- [Smart App Launch](/docs/integration/smart-app-launch) in Integrations
- [(a)(9) Clinical decision support (CDS)](https://www.healthit.gov/test-method/clinical-decision-support-cds)
- [HL7 Infobutton Implementation Guide](https://www.hl7.org/documentcenter/public/standards/dstu/V3IG_INFOBUTTON_DSTU_R4_2013JAN.pdf)
- [HT1 Final Rule](https://www.healthit.gov/sites/default/files/page/2023-12/hti-1-final-rule.pdf) on predictive clinical decision support and algorithms

---
keywords:
  - rxnorm
  - ndc
  - drugs
  - drug codes
  - medications
tags:
  - medications
  - rxnorm
---

import ExampleCode from '!!raw-loader!@site/..//examples/src/medications/medication-codes.ts';
import MedplumCodeBlock from '@site/src/components/MedplumCodeBlock';

# Medication Code Systems

## Introduction

Medication codes play a fundamental role in crafting prescriptions, medication orders, and formularies. EHRs use standardized codes to describe medications to remove ambiguity, ensure patient safety, and streamline billing and analytics.

In an ideal world, a universal standard of codes would be agreed upon to represent drugs. However, the reality is that there are multiple code systems, each with its unique characteristics and applications.

This guide is dedicated to discussing two of the most significant, non-proprietary code systems in U.S. healthcare: [RXNorm](https://www.nlm.nih.gov/research/umls/rxnorm/overview.html) and [NDC](https://www.fda.gov/drugs/drug-approvals-and-databases/national-drug-code-directory).

- [RXNorm](https://www.nlm.nih.gov/research/umls/rxnorm/overview.html) is an international standard endorsed by standards-compliant bodies such as the US Core, NIH, and CDC.
- [NDC](https://www.fda.gov/drugs/drug-approvals-and-databases/national-drug-code-directory) (National Drug Code) is a U.S. specific system administered by the Food and Drug Administration (FDA)

While there are other proprietary drug databases with their proprietary code systems, they will not be explored in this guide.

## RxNorm

RxNorm is the preferred code system of the [US Core Medication Profile](https://hl7.org/fhir/us/core/stu3.1.1/StructureDefinition-us-core-medication.html) and the National Institutes of Health (NIH), as well as most FHIR profiles.

RXNorm is a hierarchical code system, that allows for different levels of specificity, depending on the application. The RXNorm vocabulary establishes standard names and identifiers for combinations of ingredients, strengths, and dose forms. This is the information doctors typically include when they write a prescription because they often can’t know the specific product that will be used to fill it.

Each level of the RxNorm hierarchy is called a "term type" (TTY), and each element is called a "concept". Each concept in has a unique numeric code, know as it's **RxCUI**. The RXNorm hierarchy has separate codes for brand name vs. generic drugs, drug name synonyms, as well as explicit dose form, strength, and packaging types.

The [RxNAV](https://mor.nlm.nih.gov/RxNav/) browser is a useful tool to explore the RxNorm system.

The table below shows a the range of term types for the antidepressant Prozac:

| TTY  | Name                             | Description                                                                                                                                                                                        | Example Concept                                           | RxCUI   |
| ---- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ------- |
| IN   | Ingredient                       | A compound or moiety that gives the drug its distinctive clinical properties. Ingredients generally use the United States Adopted Name (USAN).                                                     | Fluoxetine                                                | 4493    |
| PIN  | Precise Ingredient               | A specified form of the ingredient that may or may not be clinically active. Most precise ingredients are salt or isomer forms.                                                                    | Fluoxetine Hydrochloride                                  | 227224  |
| MIN  | Multiple Ingredients             | Two or more ingredients appearing together in a single drug preparation, created from SCDF. In rare cases when IN/PIN or PIN/PIN combinations of the same base ingredient exist, created from SCD. | Fluoxetine / Olanzapine                                   | 611247  |
| SCDC | Semantic Clinical Drug Component | Ingredient + Strength                                                                                                                                                                              | Fluoxetine 40 mg                                          | 330341  |
| SCDF | Semantic Clinical Drug Form      | Ingredient + Dose Form                                                                                                                                                                             | FLUoxetine Oral Capsule                                   | 372231  |
| SCDG | Semantic Clinical Drug Group     | Ingredient + Dose Form Group                                                                                                                                                                       | Fluoxetine Oral Product                                   | 1160836 |
| SCD  | Semantic Clinical Drug           | Ingredient + Strength + Dose Form                                                                                                                                                                  | FLUoxetine 40 MG Oral Capsule                             | 313989  |
| BN   | Brand Name                       | A proprietary name for a family of products containing a specific active ingredient.                                                                                                               | Prozac                                                    | 58827   |
| SBDC | Semantic Branded Drug Component  | Ingredient + Strength + Brand Name                                                                                                                                                                 | fluoxetine 40 MG [PROzac]                                 | 574512  |
| SBDF | Semantic Branded Drug Form       | Ingredient + Dose Form + Brand Name                                                                                                                                                                | FLUoxetine Oral Capsule [PROzac]                          | 93904   |
| SBDG | Semantic Branded Drug Group      | Brand Name + Dose Form Group                                                                                                                                                                       | Prozac Pill                                               | 1182487 |
| SBD  | Semantic Branded Drug            | Ingredient + Strength + Dose Form + Brand Name                                                                                                                                                     | Prozac 40 MG Oral Capsule                                 | 261287  |
| PSN  | Prescribable Name                | Synonym of another TTY, given for clarity and for display purposes in electronic prescribing applications. Only one PSN per concept.                                                               | PROzac 40 MG Oral Capsule                                 |         |
| SY   | Synonym                          | Synonym of another TTY, given for clarity.                                                                                                                                                         | fluoxetine 40 MG (as fluoxetine HCl 44.8 MG) Oral Capsule |         |
| DF   | Dose Form                        | See [Appendix 2](https://www.nlm.nih.gov/research/umls/rxnorm/docs/2016/appendix2.html) for a full list of Dose Forms.                                                                             | Oral Capsule                                              | 316965  |
| DFG  | Dose Form Group                  | See [Appendix 3](https://www.nlm.nih.gov/research/umls/rxnorm/docs/2016/appendix3.html) for a full list of Dose Form Groups.                                                                       | Pill                                                      | 1151133 |

source: https://www.nlm.nih.gov/research/umls/rxnorm/docs/appendix5.html

## NDC

National Drug Codes (NDCs) are _product identifiers_ allocated by manufacturers and packagers of drugs in the U.S. These codes appear on medication labels and packages, and are commonly used in pharmacy inventory control, as well as dispensing and billing for drugs.

Unlike RXNorm, NDC operates as a flat code system and only refers to the "leaf nodes" of the RXNorm hierarchy. If a single manufacturer issues the same medication in packages of different sizes (like 25 tablets, 50 tablets, etc.), each size is assigned a unique NDC.

However, there are connections between the two code systems, as a drug product can have both NDC and RXNorm codes. Below is an example of the a [CodeableConcept](/docs/fhir-basics#standardizing-data-codeable-concepts) for Tylenol, with both NDC and RxNorm codes

<MedplumCodeBlock language="ts" selectBlocks="tylenol-example">
  {ExampleCode}
</MedplumCodeBlock>

## Other Drug databases

While this guide focuses on RxNorm and NDC, there are a few other popular drug databases in commercial use:

### First Databank (FDB)

[First Databank (FDB)](https://www.fdbhealth.com/) is a _private_ company that provides drug databases covering various aspects of drug information, including drug interactions, contraindications, clinical decision support.

FDB is very popular in both hospital and retail pharmacy settings due to its extensive data, which support a variety of clinical and operational use cases. Its commercial nature means that it has extensive coverage, including many over-the-counter medications and nutritional products not included in other databases.

While access to the [FDB MedKnowledge](https://www.fdbhealth.com/solutions/medknowledge-drug-database) database requires a paid subscription, HL7 has created a [placeholder code system](https://terminology.hl7.org/2.1.0/CodeSystem-FDDC.html) to reference these codes.

### National Drug Data File (NDB)

The NDB, also known as the National Drug File - Reference Terminology (NDF-RT), is maintained by the U.S. Department of Veterans Affairs. NDF-RT is typically used in decision support systems for medication therapy management, drug formulary checks, medication safety checks, and population-based analyses of drug effects.

NDB/NDF-RT is less popular compared to RxNorm and FDB. However, it is still widely used within the U.S. Department of Veterans Affairs, and by some EHR vendors and researchers, due to its comprehensive data on drug characteristics.

## See Also

- [RxNorm overview](https://www.nlm.nih.gov/research/umls/rxnorm/overview.html)
- [RxNav Browser](https://mor.nlm.nih.gov/RxNav/)
- [Prescribable RxNORM API](https://lhncbc.nlm.nih.gov/RxNav/APIs/PrescribableAPIs.html)
- [Drug interaction API](https://lhncbc.nlm.nih.gov/RxNav/APIs/InteractionAPIs.html)
- [RxNorm vs. NDC](https://www.nih.gov/news-events/news-releases/drug-naming-standard-electronic-health-records-enhanced)

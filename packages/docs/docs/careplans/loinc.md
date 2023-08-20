---
keywords:
  - loinc
  - diagnostics
  - lab
  - lab codes
  - diagnostic codes
  - LIS/LIMS
tags:
  - lab
  - diagnostics
  - loinc
  - care plans
  - LIS
  - LIMS
sidebar_position: 6
---

# LOINC Codes

[LOINC](https://loinc.org) (Logical Observation Identifiers Names and Codes) was established with the intention of defining a universal standard for identifying clinical data in electronic reports. The overall scope of LOINC is anything you can **test**, **measure**, or **observe** about a patient.

This guide aims to provide a basic understanding of LOINC codes and how they are applied in practice.

Adopting LOINC codes for clinical data helps:

- Leverage clinical best practices for recording patient data
- Streamline [CLIA/CAP](https://www.medplum.com/docs/compliance/clia-cap) and [ONC certification](https://www.medplum.com/docs/compliance/onc)
- Simplify billing for diagnostics

LOINC codes are most often used on [`Observation`](/docs/api/fhir/resources/observation) and [`ObservationDefinition`](/docs/api/fhir/resources/observationdefinition) resources to indicate the quantity being measured, and the US core guidelines require LOINC codes to be used for their [representation of patient vitals](/docs/fhir-datastore/understanding-uscdi-dataclasses).

You can learn more about LOINC codes by reading their [getting started guide](https://loinc.org/get-started/), and you can search for relevant codes using the [LOINC online browser](https://loinc.org/search/).

## Types of LOINC Codes

At the highest level, there are two major divisions of LOINC codes: **Laboratory** and **Clinical**

### Laboratory

Laboratory codes represent anything that you can measure or observe about a specimen extracted from a patient. It contains the usual categories of chemistry, hematology, serology, microbiology, toxicology; as well as categories for cell counts, antibiotic susceptibilities, and more <sup><a href="#ref1">1</a></sup>.

#### Examples

| Name                                     | LOINC Code                            |
| ---------------------------------------- | ------------------------------------- |
| Sodium [Moles/volume] in Blood           | [55231-5](https://loinc.org/55231-5/) |
| Leukocytes [#/volume] in Blood           | [26464-8](https://loinc.org/26464-8/) |
| Toxoplasma gondii Ab [Presence] in Serum | [22577-1](https://loinc.org/22577-1/) |

### Clinical Codes

Clinical codes represent "everything else" excluding laboratory results - anything you can measure about a patient _without_ removing a specimen from them.

This includes codes for vitals signs, hemodynamics, imaging, EKG, etc. as well as results from selected survey instruments (e.g PHQ-9 depression scale, CMS-required patient assessment instruments, etc.) <sup><a href="#ref1">1</a></sup>.

#### Examples

| Name                  | LOINC Code                            |
| --------------------- | ------------------------------------- |
| Heart Rate            | [8867-4](https://loinc.org/8867-4/)   |
| Smoking status [FTND] | [63638-1](https://loinc.org/63638-1/) |

###

:::tip Deep Dive: LOINC code components

Each LOINC code description follows a regular schema with six components <sup><a href="#ref2">2</a></sup>

| Component           | Description                                                                                                                                                | Example                        |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| Component (Analyte) | The substance or entity being measured or observed.                                                                                                        | Leukocytes (white blood cells) |
| Property            | The characteristic or attribute of the analyte.                                                                                                            | NCnc (Number concentration)    |
| Time                | The interval of time over which an observation was made.                                                                                                   | Pt (Point in time)             |
| System (Specimen)   | The specimen or thing upon which the observation was made.                                                                                                 | CSF (Cerebral spinal fluid)    |
| Scale               | How the observation value is quantified or expressed: quantitative, ordinal, nominal.                                                                      | Qn (Quantitative)              |
| Method              | (Optional) A high-level classification of how the observation was made. Only needed when the technique affects the clinical interpretation of the results. | Manual Count                   |

These six parts care then translated into "LOINC names" to represent each concept. There are 3 different levels of specificity for LOINC names:

| Level                      | **Description**                              | Example                                                        |
| -------------------------- | -------------------------------------------- | -------------------------------------------------------------- |
| Fully-Specified Name (FSN) | Formal name consisting of all six code parts | Leukocytes: NCnc: Pt: CSF: Qn: Manual count                    |
| Long Common Name (LCN)     | Clinician-friendly display name              | Leukocytes [#/volume] in Cerebral spinal fluid by Manual count |
| Short Name                 | Short code for column headers & reporting    | WBC # CSF Manual                                               |

You can find more information about LOINC code parts [here](https://loinc.org/kb/faq/structure/)

:::

## Collection Codes

In addition to individual clinical findings, LOINC includes codes for common collections of findings, also known as "panels," "batteries," "surveys," or "questionnaires" depending on the clinical context.

#### Examples

| **Panel Name**                              | Type          | LOINC Code                            | Members                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------------------- | ------------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Patient Health Questionnaire 4 item (PHQ-4) | Questionnaire | [69725-0](https://loinc.org/69724-3/) | <ul><li>[69725-0](https://loinc.org/69725-0) - Feeling nervous, anxious or on edge</li><li> [68509-9](https://loinc.org/68509-9) - Over the past 2 weeks have you not been able to stop or control worrying</li><li>[44250-9](https://loinc.org/44250-9) - Little interest or pleasure in doing things</li><li>[44255-8](https://loinc.org/44255-8) - Feeling down, depressed, or hopeless</li><li>[70272-0](https://loinc.org/70272-0) - Patient Health Questionnaire 4 item (PHQ-4) total score [Reported]</li></ul> |
| Basic metabolic panel - Blood               | Lab Panel     | [51990-0](https://loinc.org/51990-0/) | <ul><li>[2339-0](https://loinc.org/2339-0) -Glucose [Mass/volume] in Blood</li><li> [6299-2](https://loinc.org/6299-2) - Urea nitrogen [Mass/volume] in Blood</li><li>[38483-4](https://loinc.org/38483-4) - Creatinine [Mass/volume] in Blood</li><li>[44734-2](https://loinc.org/21550) - Urea nitrogen/Creatinine [Mass Ratio] in Blood</li><li>[49765-1](https://loinc.org/44734-2) - Calcium [Mass/volume] in Blood</li><li>[55231-5](https://loinc.org/55231-5) - Electrolytes panel - Blood</li></ul>           |

You can find the constituent members of a collection by browsing [loinc.org](https://loinc.org) page for a collection's LOINC code and navigating "panel hierarchy" section.

## Questionnaire Answers and Answer Lists

The ambition of LOINC is to standardize clinical data collection across organizations and clinical settings.

To standardize responses to questionnaires, LOINC provides standard codes not only for questions, _but also_ to answer choices for multiple-choice questions. These LOINC codes are prefixed with `LA`, which stands for "LOINC Answer".

These answer choices are then bundled into 'answer lists', which are annotated with their own distinctive LOINC codes, prefixed with `LL`.

What's fantastic about the LOINC system is its intuitiveness. For instance, when you're browsing loinc.org and you view the code for a question, you're also shown any recommended answer values. This level of interconnectedness makes navigating and understanding the LOINC system that much more user-friendly.

#### Examples

| Question                                                                   | Answer List                            | Answers                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| -------------------------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Feeling nervous, anxious or on edge ([69725-0](https://loinc.org/69725-0)) | [LL358-3](https://loinc.org/LL358-3)   | <ul><li>Not at all ([LA6568-5](https://loinc.org/LA6568-5))</li><li>Several days ([LA6569-3](https://loinc.org/LA6569-3))</li><li>More than half the days ([LA6570-1](https://loinc.org/LA6570-1))</li><li>Nearly every day ([LA6571-9](https://loinc.org/LA6571-9))</li></ul>                                                                                                                                                                                                                    |
| Age group ([46251-5](https://loinc.org/46251-5))                           | [LL2435-7](https://loinc.org/LL2435-7) | <ul><li>Infant ([LA19747-7](https://loinc.org/LA19747-7))</li><li>Newborn ([LA10403-6](https://loinc.org/LA10403-6))</li><li>Child ([LA9949-4](https://loinc.org/LA9949-4))</li><li>Pre-school ([LA19748-5](https://loinc.org/LA19748-5))</li><li>Adolescent ([LA19749-3](https://loinc.org/LA19749-3))</li><li>Adult ([LA13524-6](https://loinc.org/LA13524-6))</li><li>Middle aged ([LA19750-1](https://loinc.org/LA19750-1))</li><li>Aged ([LA19751-9](https://loinc.org/LA19751-9))</li></ul> |

<details><summary>Example: PHQ-4 Questionnaire</summary>

```json
{
  "resourceType": "Questionnaire",
  "title": "Patient Health Questionnaire 4 item (PHQ-4) [Reported]",
  "status": "draft",
  "code": [
    {
      "code": "69724-3",
      "display": "Patient Health Questionnaire 4 item (PHQ-4) [Reported]",
      "system": "http://loinc.org"
    }
  ],
  "meta": {
    "profile": ["http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire|2.7"]
  },
  "item": [
    {
      "type": "choice",
      "code": [
        {
          "code": "69725-0",
          "display": "Feeling nervous, anxious or on edge"
        }
      ],
      "required": false,
      "linkId": "/69725-0",
      "text": "Feeling nervous, anxious or on edge",
      "answerOption": [
        {
          "valueCoding": {
            // highlight-start
            "code": "LA6568-5",
            "display": "Not at all",
            "system": "http://loinc.org"
            // highlight-end
          }
        },
        {
          "valueCoding": {
            // highlight-start
            "code": "LA6569-3",
            "display": "Several days",
            "system": "http://loinc.org"
            // highlight-end
          }
        },
        {
          "valueCoding": {
            // highlight-start
            "code": "LA6570-1",
            "display": "More than half the days",
            "system": "http://loinc.org"
            // highlight-end
          }
        },
        {
          "valueCoding": {
            // highlight-start
            "code": "LA6571-9",
            "display": "Nearly every day",
            "system": "http://loinc.org"
            // highlight-end
          }
        }
      ]
    },
    {
      "type": "choice",
      "code": [
        {
          "code": "68509-9",
          "display": "Over the past 2 weeks have you not been able to stop or control worrying",
          "system": "http://loinc.org"
        }
      ],
      "required": false,
      "linkId": "/68509-9",
      "text": "Over the past 2 weeks have you not been able to stop or control worrying",
      "answerOption": [
        {
          "valueCoding": {
            // highlight-start
            "code": "LA6568-5",
            "display": "Not at all",
            "system": "http://loinc.org"
            // highlight-end
          }
        },
        {
          "valueCoding": {
            // highlight-start
            "code": "LA6569-3",
            "display": "Several days",
            "system": "http://loinc.org"
            // highlight-end
          }
        },
        {
          "valueCoding": {
            // highlight-start
            "code": "LA18938-3",
            "display": "More days than not",
            "system": "http://loinc.org"
            // highlight-end
          }
        },
        {
          "valueCoding": {
            // highlight-start
            "code": "LA6571-9",
            "display": "Nearly every day",
            "system": "http://loinc.org"
            // highlight-end
          }
        }
      ]
    },
    {
      "type": "choice",
      "code": [
        {
          "code": "44250-9",
          "display": "Little interest or pleasure in doing things",
          "system": "http://loinc.org"
        }
      ],
      "required": false,
      "linkId": "/44250-9",
      "text": "Little interest or pleasure in doing things",
      "answerOption": [
        {
          "valueCoding": {
            // highlight-start
            "code": "LA6568-5",
            "display": "Not at all",
            "system": "http://loinc.org"
            // highlight-end
          }
        },
        {
          "valueCoding": {
            // highlight-start
            "code": "LA6569-3",
            "display": "Several days",
            "system": "http://loinc.org"
            // highlight-end
          }
        },
        {
          "valueCoding": {
            // highlight-start
            "code": "LA6570-1",
            "display": "More than half the days",
            "system": "http://loinc.org"
            // highlight-end
          }
        },
        {
          "valueCoding": {
            // highlight-start
            "code": "LA6571-9",
            "display": "Nearly every day",
            "system": "http://loinc.org"
            // highlight-end
          }
        }
      ]
    },
    {
      "type": "choice",
      "code": [
        {
          "code": "44255-8",
          "display": "Feeling down, depressed, or hopeless",
          "system": "http://loinc.org"
        }
      ],
      "required": false,
      "linkId": "/44255-8",
      "text": "Feeling down, depressed, or hopeless",
      "answerOption": [
        {
          "valueCoding": {
            // highlight-start
            "code": "LA6568-5",
            "display": "Not at all",
            "system": "http://loinc.org"
            // highlight-end
          }
        },
        {
          "valueCoding": {
            // highlight-start
            "code": "LA6569-3",
            "display": "Several days",
            "system": "http://loinc.org"
            // highlight-end
          }
        },
        {
          "valueCoding": {
            // highlight-start
            "code": "LA6570-1",
            "display": "More than half the days",
            "system": "http://loinc.org"
            // highlight-end
          }
        },
        {
          "valueCoding": {
            // highlight-start
            "code": "LA6571-9",
            "display": "Nearly every day",
            "system": "http://loinc.org"
            // highlight-end
          }
        }
      ]
    },
    {
      "type": "decimal",
      "code": [
        {
          "code": "70272-0",
          "display": "Patient health questionnaire 4 item total score",
          "system": "http://loinc.org"
        }
      ],
      "required": false,
      "linkId": "/70272-0",
      "text": "Patient health questionnaire 4 item total score",
      "item": [
        {
          "text": "The PHQ-4 is different -- although the total score (which ranges from 0-12) can be used, it is really a combination of the PHQ-2 depression scale (described above) and the GAD-2 anxiety scale (from the parent GAD-7 anxiety scale).  Thus, another way to look at it is a 0-6 depression subscale and a 0-6 anxiety scale. It is clearly different than either the PHQ-9 or the PHQ-2",
          "type": "display",
          "linkId": "/70272-0-help"
        }
      ]
    }
  ]
}
```

</details>

## See Also

- [<sup id="ref1">[1]</sup> Scope of Loinc](https://loinc.org/get-started/scope-of-loinc)
- [<sup id="ref2">[2]</sup> LOINC Term Basics](https://loinc.org/get-started/loinc-term-basics)
- [LOINC Typeahead](https://clinicaltables.nlm.nih.gov/apidoc/loinc/v3/doc.html) and other [code system typeaheads](https://clinicaltables.nlm.nih.gov/) can be found on the NIH website
- [LOINC Browser](https://loinc.org/search)
- [LOINC Top 2000 Lab Observations](https://loinc.org/usage/obs/)
- [Social Determinants of Health (SDOH) LOINC Groups](https://loinc.org/search/?t=4&s=SDH)

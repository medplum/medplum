## Usage

Performing a clinical assessment is a fundamental part of a clinician's workflow, performed repeatedly throughout the day. In spite of this - or perhaps, because of it - there is wide variance in how clinical impressions are recorded. Some clinical assessments simply result in an impression recorded as a single text note in the patient 'record' (e.g. "Progress satisfactory, continue with treatment"), while others are associated with careful, detailed record keeping of the evidence gathered and the reasoning leading to a differential diagnosis, and there is a continuum between these. This resource is intended to be used to cover all these use cases.

The assessment is intimately linked to the process of care. It may occur in the context of a care plan, and it very often results in a new (or revised) care plan. Normally, clinical assessments are part of an ongoing process of care, and the patient will be re-assessed repeatedly. For this reason, the clinical impression can explicitly reference both care plans (preceding and resulting) and reference a previous impression that this impression follows.

An impression is a clinical summation of information and/or an opinion formed, which is the outcome of the clinical assessment process. The [ClinicalImpression](/docs/api/fhir/resources/clinicalimpression) may lead to a statement of a [Condition](/docs/api/fhir/resources/condition) about a patient.

In FHIR, an assessment is typically an instrument or tool used to collect information about a patient.

> **Trial-Use Note:** Unlike many other resources, there is little prior art with regard to exchanging records of clinical assessments. For this reason, this resource should be regarded as particularly prone to ongoing revision. In terms of scope and usage, the [Patient](/docs/api/fhir/resources/patient) Care workgroup wishes to draw the attention of reviewers and implementers to the following issues:
>
> - When is an existing clinical impression revised, rather than a new one created (that references the existing one)? How does that affect the status? what's the interplay between the status of the diagnosis and the status of the impression? (e.g. for a 'provisional' impression, which bit is provisional?)
> - This structure doesn't differentiate between a working and a final diagnosis. Given an answer to the previous question, should it?
> - Further clarify around the relationship between care plan and impression is needed. Both answers to the previous questions and ongoing discussions around revisions to the care plan will influence the design of clinical impression
> - Should prognosis be represented, and if so, how much structure should it have?
> - Should an impression reference other impressions that are related? (how related?)
> - Investigations - the specification needs a good value set for the code for the group, and will be considering the name "investigations" further
>
> Feedback is welcome [here](http://hl7.org/fhir-issues) .

## Relationships

[ClinicalImpression](/docs/api/fhir/resources/clinicalimpression) is the equivalent of the "A" in Weed SOAP. It is the outcome of the clinical assessment process. The [ClinicalImpression](/docs/api/fhir/resources/clinicalimpression) may lead to a statement of a [Condition](/docs/api/fhir/resources/condition) about a patient. There is another related clinical concept often called an "assessment": assessment Tools such as Apgar (also known as "Assessment Scales"). This is not what the [ClinicalImpression](/docs/api/fhir/resources/clinicalimpression) resource is about; assessment tools such as Apgar are represented as [Observations](/docs/api/fhir/resources/observation), and [Questionnaires](/docs/api/fhir/resources/questionnaire) may be used to help generate these. Clinical Impressions may refer to these assessment tools as one of the investigations that was performed during the assessment process.

## Background and Context

An important background to understanding this resource is [the FHIR Confluence page for clinical assessment](https://confluence.hl7.org/display/PC/Clinical+Assessment) . In particular, the storyboards there drove the design of the resource, and will be the basis for all examples created.

**PLANNED CHANGE:**

**ClinicalImpression** is one of the [Event](https://www.hl7.org/fhir/workflow.html#event) resources in the FHIR [Workflow](https://www.hl7.org/fhir/workflow.html) specification. As such, it is expected to be adjusted to align with the [Event](https://www.hl7.org/fhir/event.html) workflow pattern which will involve adding a number of additional data elements and potentially renaming a few elements. Any concerns about performing such alignment are welcome as ballot comments and/or tracker items.

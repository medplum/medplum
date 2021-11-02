---
title: ResearchStudy
sidebar_position: 519
---

# ResearchStudy

A process where a researcher or organization plans and then executes a series of steps intended to increase the field of
  healthcare-related knowledge.  This includes studies of safety, efficacy, comparative effectiveness and other
  information about medications, devices, therapies and other interventional and investigative techniques.  A
  ResearchStudy involves the gathering of information about human or animal subjects.

## Properties

| Name | Card | Type | Description |
| --- | --- | --- | --- |
| id | 0..1 | string | Logical id of this artifact
| meta | 0..1 | Meta | Metadata about the resource
| implicitRules | 0..1 | uri | A set of rules under which this content was created
| language | 0..1 | code | Language of the resource content
| text | 0..1 | Narrative | Text summary of the resource, for human interpretation
| contained | 0..* | Resource | Contained, inline Resources
| extension | 0..* | Extension | Additional content defined by implementations
| modifierExtension | 0..* | Extension | Extensions that cannot be ignored
| identifier | 0..* | Identifier | Business Identifier for study
| title | 0..1 | string | Name for this study
| protocol | 0..* | Reference | Steps followed in executing study
| partOf | 0..* | Reference | Part of larger study
| status | 1..1 | code | active \| administratively-completed \| approved \| closed-to-accrual \|
  closed-to-accrual-and-intervention \| completed \| disapproved \| in-review \| temporarily-closed-to-accrual \|
  temporarily-closed-to-accrual-and-intervention \| withdrawn
| primaryPurposeType | 0..1 | CodeableConcept | treatment \| prevention \| diagnostic \| supportive-care \| screening \|
  health-services-research \| basic-science \| device-feasibility
| phase | 0..1 | CodeableConcept | n-a \| early-phase-1 \| phase-1 \| phase-1-phase-2 \| phase-2 \| phase-2-phase-3 \| phase-3 \| phase-4
| category | 0..* | CodeableConcept | Classifications for the study
| focus | 0..* | CodeableConcept | Drugs, devices, etc. under study
| condition | 0..* | CodeableConcept | Condition being studied
| contact | 0..* | ContactDetail | Contact details for the study
| relatedArtifact | 0..* | RelatedArtifact | References and dependencies
| keyword | 0..* | CodeableConcept | Used to search for the study
| location | 0..* | CodeableConcept | Geographic region(s) for study
| description | 0..1 | markdown | What this is study doing
| enrollment | 0..* | Reference | Inclusion & exclusion criteria
| period | 0..1 | Period | When the study began and ended
| sponsor | 0..1 | Reference | Organization that initiates and is legally responsible for the study
| principalInvestigator | 0..1 | Reference | Researcher who oversees multiple aspects of the study
| site | 0..* | Reference | Facility where study activities are conducted
| reasonStopped | 0..1 | CodeableConcept | accrual-goal-met \| closed-due-to-toxicity \|
  closed-due-to-lack-of-study-progress \| temporarily-closed-per-study-design
| note | 0..* | Annotation | Comments made about the study
| arm | 0..* | BackboneElement | Defined path through the study for a subject
| objective | 0..* | BackboneElement | A goal for the study

## Search Parameters

| Name | Type | Description | Expression
| --- | --- | --- | --- |
| category | token | Classifications for the study | ResearchStudy.category
| date | date | When the study began and ended | ResearchStudy.period
| focus | token | Drugs, devices, etc. under study | ResearchStudy.focus
| identifier | token | Business Identifier for study | ResearchStudy.identifier
| keyword | token | Used to search for the study | ResearchStudy.keyword
| location | token | Geographic region(s) for study | ResearchStudy.location
| partof | reference | Part of larger study | ResearchStudy.partOf
| principalinvestigator | reference | Researcher who oversees multiple aspects of the study | ResearchStudy.principalInvestigator
| protocol | reference | Steps followed in executing study | ResearchStudy.protocol
| site | reference | Facility where study activities are conducted | ResearchStudy.site
| sponsor | reference | Organization that initiates and is legally responsible for the study | ResearchStudy.sponsor
| status | token | active \| administratively-completed \| approved \| closed-to-accrual \| closed-to-accrual-and-intervention \| completed \| disapproved \| in-review \| temporarily-closed-to-accrual \| temporarily-closed-to-accrual-and-intervention \| withdrawn | ResearchStudy.status
| title | string | Name for this study | ResearchStudy.title


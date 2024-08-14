# Life Sciences

Highly customizable and integrated data management solution for clinical trials and research. Collect data in a standards compliant and automated way, with great visibility into your workflow and status. This is a solution for teams that find themselves building software to enable their clinical research and find a traditional Electronic Data Capture (EDC) hard to customize.

:::caution Note

This section is under construction. Check back frequently for updates.

:::

## Overview and Problem Space

Clinical Trials and clinical research projects require a high fidelity workflow and data management process. Traditional Electronic Data Capture (EDC) systems are difficult to customize and many teams end up writing software to execute their research. When customizability and integrations are important, Medplum can be a useful tool.

At the end of the day, great standards compliant data management, specifically for assessments, has two major advantages:

1. A faster path to a high confidence clinical protocol that's well documented.
2. High quality, conformant data (FHIR, SDTM, ADaM) that's structured well for submission or publication.

Here is a summary of common limitations and problems areas as they relate to the workflow in life sciences.

| Work stream                      | Description                                                                                           | Problem Areas                                                                 |
| -------------------------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Assessment Management            | COA, Lab panels, medical device management                                                            | Maintaining data, version history, usage, provenance for instruments          |
| Schedule of Assessments          | Building a schedule of assessments protocol                                                           | Feedback, documentation and protocol re-use                                   |
| Protocol Documentation           | Creating a protocol document, with references                                                         | Building a protocol that can be read by people, and imported into tools       |
| Standards adherence              | Ensuring that data is produced adheres to industry standards                                          | Data from tools, such as Mapi Trust or Actigraph is non-standard (CDISC/FHIR) |
| User-facing software integration | COA, ePRO and other survey based instruments exist in many tools across platforms (iOS, Android, web) | Tracking versions and instruments across platforms, integrating responses     |
| Media handling                   | Research often entails gathering images, videos, documents, binary files                              | EDC platforms have mixed support for binary data types                        |
| EHR Integration                  | Clinical research often requires pulling medical history from existing EHRs, systems                  | Getting data out of the EHR, LIS or other systems                             |

## Planning

One of the common planning scenarios is designing the Schedule of Assessments, and choosing which instruments (COA, ClinRo, ePRO, Lab Panels, Vitals, connected technologies etc.) go into the schedule. Versioning, and applying feedback from stakeholders, and maintaining the assessment list from study to study is important as well. This guide gives an overview of how to store assessments so that they can be exported, validated and re-used effectively.

### Assessment Management

#### Survey Based Instruments

Survey based instruments are modeled using the [FHIR Questionnaires](/docs/api/fhir/resources/questionnaire). View questionnaires [here](https://app.medplum.com/Questionnaire), and create new ones [here](https://app.medplum.com/Questionnaire/new). The representation of the COA in the library is independent from its use in practice. Surveys can be collected on iOS, Android or using a system like Qualtrics and synchronized back as a [FHIR QuestionnareResponse](/docs/api/fhir/resources/questionnaireresponse) via [Bots](/docs/bots). If the data is structured and tagged correctly, reporting and validation will remain intact.

To effectively manage your survey based instrument, you'll want to ensure that each is represented as a FHIR Questionnaire and is tagged with the appropriate Metadata, specifically:

- `Questionnaire.url`: Link to the documentation of the instrument. For example, if it is from Mapi-Trust, include the URL.
- Identifiers: add any relevant identifiers (from Mapi-Trust, internal systems, CDC, etc.) to the `Questionnaire.id` field. Multiple identifiers from different systems are supported and encouraged.
- FDA ontology: Tag each instrument with PRO, ClinRo, PerfO, ObsRo as a CodableConcept in the `Questionnaire.code` field
- Locale and Languages: Mark locales, such as `EN-US` in as a CodableConcept in `Questionnaire.jurisdiction`
- Binary Files: Sometimes binary files such as Android APK files, or iOS binaries are required for a validated instrument. It is recommended to store these as [FHIR Media](/docs/api/fhir/resources/media) resources, with references to the original Questionnaire in `Media.basedOn` field, for appropriate indexing.
- Questionnaire Level CDISC, LOINC and SNOMED tags: add the appropriate tags to the `Questionnaire.code` field.
- Question level tags: for each `Questionnaire.item` add one or more CDISC, LOINC or SNOMED codes.
- Tagging both the Questionnaire resources and the `Questionnaire.item` with other ontologies from Meddra, Mapi-Trust as suits your workflow.

This setup and tagging will ensure that data collected is also properly tagged and can be exported readily to other systems or converted to document/PDF format.

You can see a sample of how to construct questionnaires with the appropriate tags on [Github](https://github.com/medplum/medplum/blob/main/packages/react/src/QuestionnaireForm/QuestionnaireForm.stories.tsx).

Consents are a special category, and are [FHIR Consent](https://app.medplum.com/Consent) resources. Documentation [here](/docs/api/fhir/resources/consent).

#### Lab Based Instruments

Lab panels and assays are modeled as [FHIR PlanDefinition](/docs/api/fhir/resources/plandefinition) for the panel and [FHIR ActivityDefinition](/docs/api/fhir/resources/activitydefinition) for the assay. Each ActivityDefinition should also have a [SpecimenDefinition](/docs/api/fhir/resources/specimendefinition) and one or more [ObservationDefinition](/docs/api/fhir/resources/observationdefinition). A correct panel setup will ensure that collected data is tagged correctly. The following best practices are recommended.

- `PlanDefinition.type` should include LOINC, SNOMED, and CDISC codes where appropriate
- `ActivityDefinition.code` should include LOINC, SNOMED and CDISC codes where appropriate
- `ActivityDefinition.specimenRequirement` should link to the SpecimenDefinition
- `ActivityDefinition.observationRequirement` should link to the ObservationDefinition, which should also be tagged with appropriate LOINC, SNOMED and CDISC codes.

You can see an example of a [PlanDefinition for Lab in code](https://github.com/medplum/medplum/blob/main/packages/react/src/stories/covid19.ts#L742) and on [Storybook](https://storybook.medplum.com/?path=/docs/medplum-plandefinitionbuilder--covid-19-pcr-lab-service-story).

You can see an example of a simple [ActivityDefinition for Lab in code](https://github.com/medplum/medplum/blob/main/packages/react/src/stories/covid19.ts#L678) or on [Storybook](https://storybook.medplum.com/?path=/docs/medplum-resourcetable--covid-19-pcr-test-activity).

Here is an [ObservationDefinition for Lab in code](https://github.com/medplum/medplum/blob/main/packages/react/src/stories/covid19.ts#L688) and [ObservationDefinition on Storybook](https://storybook.medplum.com/?path=/docs/medplum-resourcetable--observation-ignore-empty)

Overall, the [COVID-19 Data model sample](https://github.com/medplum/medplum/blob/main/packages/react/src/stories/covid19.ts) can be useful to get a sense of how to represent labs in FHIR.

#### Digital Technologies

Digital technologies such as a continuous glucose monitor, blood pressure cuff and more should be modeled as ActivityDefinition with `ActivityDefinition.observationRequirement` being one or more ObservationDefinition. Both resources should be tagged with Measures That Matter, Meddra, CDISC, LOINC and SNOMED codes where appropriate. Sample codes that apply to these resources are:

- [Glucose Reading](https://loinc.org/99504-3/) for an ObservationDefinition
- [Blood Pressure panel](https://loinc.org/35094-2/) for an ActivityDefinition

### Schedule of Assessments

Once the instruments are tagged, the next step is to build the Schedule of Assessments (SoA), which is a tool for assembling the assessments onto a timeline, but it's a relative timeline, may start on an arbitrary date and milestones are relative to one-another. The SoA is technically a protocol, and has many similarities to a [Care Plan](../products/careplans). The data model is as follows:

- SoA overall is represented as a [PlanDefinition](/docs/api/fhir/resources/plandefinition), and you can see a sample on [Storybook]
- [PlanDefinition](/docs/api/fhir/resources/plandefinition)s have `action`s, and these are the milestones on the SoA, each `action` should have a [Timing](/docs/api/fhir/datatypes/timing) (e.g. between day 2 and day 3) and a [Location](/docs/api/fhir/resources/location), even if the assessment is done at home.

You can see a sample of a [SoA in Code here](https://github.com/medplum/medplum/blob/main/packages/react/src/stories/covid19.ts#L704).

#### Exporting your Schedule of Assessments

Exporting the schedule of assessments is possible using the [Bot](/docs/bots) framework. A common pattern is to export the protocol to a number of formats like CDISC PRM, CSV, PDF, DOCX, or allow it to be read as FHIR via the API.

## Health Records Integration

Data capture from legacy EHRs, LIS/LIMS, records request aggregators, COA tools, form builders and digital signatures and more. This is done through the [integration and interoperability engine](../products/integration).

### Patient-facing tools integration

PRO data comes in from a multitude of systems like Qualtrics, custom mobile applications, and various form builder and survey tools. Integrate, normalize and tag the data using the [integration and interoperability engine](../products/integration) and [bots](/docs/bots).

## Dashboards and Reporting

Build a powerful dashboard that can track your workflow and get where you need to quickly. Our admin console [app.medplum.com](https://app.medplum.com) supports building worklists to get you started quickly, for example:

- [Adverse Events](https://app.medplum.com/AdverseEvent?_count=20&_fields=id,date,detected,event,location,outcome,recorder,seriousness,severity,study,subject&_offset=0&_sort=-_lastUpdated) dash
- [Protocols and SoA Dash](https://app.medplum.com/PlanDefinition?_count=20&_fields=_lastUpdated,author,name,status,subject[x]&_offset=0&_sort=-_lastUpdated)
- [Per Patient SoA](https://app.medplum.com/RequestGroup?_count=20&_fields=_lastUpdated,groupIdentifier,participant,reasonCode,reasonReference,priority,note&_offset=0&_sort=-_lastUpdated)

## FHIR Resources

| Resource              | App Link                                                  | Create New                                                      | API Documentation                                     |
| --------------------- | --------------------------------------------------------- | --------------------------------------------------------------- | ----------------------------------------------------- |
| ResearchStudy         | [View All](https://app.medplum.com/ResearchStudy)         | [Create New](https://app.medplum.com/ResearchStudy/new)         | [API](/docs/api/fhir/resources/researchstudy)         |
| PlanDefinition        | [View All](https://app.medplum.com/PlanDefinition)        | [Create New](https://app.medplum.com/PlanDefinition/new)        | [API](/docs/api/fhir/resources/plandefinition)        |
| ActivityDefinition    | [View All](https://app.medplum.com/ActivityDefinition)    | [Create New](https://app.medplum.com/ActivityDefinition/new)    | [API](/docs/api/fhir/resources/activitydefinition)    |
| Questionnaire         | [View All](https://app.medplum.com/Questionnaire)         | [Create New](https://app.medplum.com/Questionnaire/new)         | [API](/docs/api/fhir/resources/questionnaire)         |
| QuestionnaireResponse | [View All](https://app.medplum.com/QuestionnaireResponse) | [Create New](https://app.medplum.com/QuestionnaireResponse/new) | [API](/docs/api/fhir/resources/questionnaireresponse) |
| ObservationDefinition | [View All](https://app.medplum.com/ObservationDefinition) | [Create New](https://app.medplum.com/ObservationDefinition/new) | [API](/docs/api/fhir/resources/observationdefinition) |
| Observation           | [View All](https://app.medplum.com/Observation)           | [Create New](https://app.medplum.com/Observation/new)           | [API](/docs/api/fhir/resources/observation)           |
| SpecimenDefinition    | [View All](https://app.medplum.com/SpecimenDefinition)    | [Create New](https://app.medplum.com/SpecimenDefinition/new)    | [API](/docs/api/fhir/resources/specimendefinition)    |
| AdverseEvent          | [View All](https://app.medplum.com/AdverseEvent)          | [Create New](https://app.medplum.com/AdverseEvent/new)          | [API](/docs/api/fhir/resources/adverseevent)          |
| DiagnosticReport      | [View All](https://app.medplum.com/DiagnosticReport)      | [Create New](https://app.medplum.com/DiagnosticReport/new)      | [API](/docs/api/fhir/resources/diagnosticreport)      |
| RequestGroup          | [View All](https://app.medplum.com/RequestGroup)          | Created programmatically $apply                                 | [API](/docs/api/fhir/resources/requestgroup)          |

## Resources and Reference Materials

- [CDISC to FHIR Mapping on HL7.org](http://hl7.org/fhir/uv/cdisc-mapping/STU1/)
- [CDISC Foundational Concepts](https://www.cdisc.org/standards/foundational)
- [CDISC Controlled Terminology](https://www.cdisc.org/standards/terminology/controlled-terminology)
- [Mapi Research Trust](https://mapi-trust.org/) COA library
- [HumanFirst Atlas Measure Ontology](https://www.gohumanfirst.com/atlas/measure-ontologies)
- [Clinical Research Measures that Matter](https://www.karger.com/Article/Fulltext/509725)
- [LOINC Codes](https://loinc.org/)
- [SNOMED](https://www.snomed.org/)
- CDISC Primer: [SDTM](https://www.cdisc.org/standards/foundational/adam), [ADaM](https://www.cdisc.org/standards/foundational/adam)
- Blog Post: The Pre-Product Startup and the FDA on [Y Combinator](https://www.ycombinator.com/blog/the-pre-product-startup-and-the-fda/) by Reshma Khilnani
- Blog Post: FDA Orientation for Early Stage Startups on [Y Combinator](https://www.ycombinator.com/blog/fda-orientation-for-early-stage-startups/) by Reshma Khilnani
- Blog Post: How to start a Biotech Company on a Budget on [Y Combinator](https://www.ycombinator.com/blog/how-to-start-a-biotech-company-on-a-budget/) by Reshma Khilnani

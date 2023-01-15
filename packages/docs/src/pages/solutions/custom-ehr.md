# Custom EHR

Providers often want a custom experience to help smooth workflow, productivity and protocol compliance. Medplum provides a great starter kit and examples for those who want a custom experience, but don't want to invest a lot of resources into infrastructure.

## Sample Application

The Medplum custom EHR sample application is called [Foo Medical provider](https://provider.foomedical.com/). You can [request access](https://questionnaires.gle/c41NddaDroCU88yt7) to view the application, or view the [source code](https://github.com/medplum/foomedical-provider).

Foo Medical Provider is intended as a sample, and the experience is truly up to the developer to determine. It is built off of the Medplum API, and is HIPAA compliant and SOC 2 Type 2 certified. Detailed compliance information can be found on our [compliance portal](../docs/compliance).

## Customizable Home Page

The homepage is customizable, and can be a great place to communicate the most important tasks to practitioners. On the home page dashboards, worklists, task lists and upcoming appointments are popular.

## Care Plans and Service Menu

Design your service menu and care plans and track patients across their journey. Custom reports and analytics are available as well. [Learn more](../products/careplans).

## Questionnaires

Make and manage questionnaires for clinicians and patients. Link them to powerful automations. [Learn more](../products/questionnaires).

## Notes and Charting

Physician notes are represented in FHIR by the [Encounter](/docs/api/fhir/resources/encounter) object. Common implementations involve using custom [questionnaires](../products/questionnaires) to populate the Encounter object via [bot](/docs/bots/bot-for-questionnaire-response), or creating the object via the API.

## Schedules

Create schedules and slots and allow patients to book them. Create schedules that are geographically linked, belong to a specific practitioner or service, or other complex requirements. [Learn more](../products/scheduling).

## Medications

Manage patient medications and refills, and create a pharmacy service that fits the needs of your patient population through custom [integrations](../products/integration).

## Specialties, patient education and more

Medplum data model is based on FHIR and has data structures and ontologies that support specialties like pediatrics, oncology, immunology and more. Create a custom EHR that is purpose built for a specialty.

## API Access

All applications built on Medplum will inherit FHIR API access, which can be given to partners as needed. Control what data partners can see with [access controls](/docs/auth/access-control).

## Certification and Scope

There is a wide range of functionality that could be included in an EHR. Organizations building a custom EHR often want to go deep in one area, while maintaining a base of functionality that's common in EHRs. It can be useful to read the [ONC certification](https://www.medplum.com/docs/compliance/onc) guide to learn what features are commonly found in an EHR.

In general, HIPAA compliance is a must for EHRs, SOC2 Type 2 audit is recommended, and ONC Certification is not required, except in some scenarios.

## Demos and Resources

- Sample application [Foo Medical provider](https://provider.foomedical.com/), [request access](https://questionnaires.gle/c41NddaDroCU88yt7) or run the application off of your own Medplum project.
- Source code for [Foo Medical Provider](https://github.com/medplum/foomedical-provider)
- [Compliance](https://www.medplum.com/docs/compliance) portal with guides and resources.
- [CMS Definition of Electronic Health Record](https://www.cms.gov/Medicare/E-Health/EHealthRecords)

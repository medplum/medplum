# Custom EHR

Providers often want a custom experience to help smooth workflow, productivity and protocol compliance. Medplum provides a great starter kit and examples for those who want a custom experience, but don't want to invest a lot of resources into infrastructure.

## Sample Application

The Medplum custom EHR sample base application is called `medplum-hello-world`. You can view the [source code](https://github.com/medplum/medplum-hello-world).

The `medplum-hello-world` applications is intended as a sample, and the experience is truly up to the developer to determine. The application provides out of the box authentication, navigation and includes our [react component library](/docs/react).

## Customizable Pages

The pages are customizable, and can be a great place to communicate the most important tasks to practitioners. On the home page dashboards, worklists, task lists and upcoming appointments are popular.

## Notes and Charting

Physician notes are represented in FHIR by the [Encounter](/docs/api/fhir/resources/encounter) object. Common implementations involve using custom [questionnaires](../products/questionnaires) to populate the Encounter object via [bot](/docs/bots/bot-for-questionnaire-response), or creating the object via the API.

Common use cases include advanced [task](/docs/careplans/tasks) tooling and [scheduling](../products/scheduling).

## Medications

Manage patient [medications](/docs/medications) and refills, and create a pharmacy service that fits the needs of your patient population through custom [integrations](../products/integration).

## API Access

All applications built on Medplum will inherit FHIR API access, which can be given to partners as needed. Control what data partners can see with [access controls](/docs/access/access-policies).

## Certification and Scope

There is a wide range of functionality that could be included in an EHR. Organizations building a custom EHR often want to go deep in one area, while maintaining a base of functionality that's common in EHRs. It can be useful to read the [ONC certification](https://www.medplum.com/docs/compliance/onc) guide to learn what features are commonly found in an EHR.

In general, HIPAA compliance is a must for EHRs, SOC2 Type 2 audit is recommended, and ONC Certification is not required, except in some scenarios.

## Case Studies

- [Develo Pediatric EHR](/blog/develo-case-study)
- [Text Pediatricians in 15 Minutes - Summer Health Case Study](/blog/summer-case-study)
- [Value Based Care and Elderly Populations - Ensage Case Study](/blog/ensage-case-study)

## Demos and Resources

- [Compliance](https://www.medplum.com/docs/compliance) portal with guides and resources.
- [CMS Definition of Electronic Health Record](https://www.cms.gov/Medicare/E-Health/EHealthRecords)

# Provider Portal

Allowing physicians who belong to multiple practices to have access to patient data as needed for care is a common scenario. Medplum provides **a starter kit to build a provider portal** with a custom experience. Practices and companies consider a custom portal when an off-the-shelf solution has low engagement because it is too confusing or complex for referring physicians or other stakeholders.

## Benefits of a Provider Portal

Provider portals can be a great tool for care coordination, partnerships and remote patient monitoring scenarios. Many diagnostics companies and specialists find the provider portal and API useful in care delivery. Some examples:

- **Pediatrics:** allow pediatricians to care plans for patients referred to specialists
- **Speciality lab:** send notification and secure access to diagnostic reports for referring physicians

## Sample Application

The Medplum provider portal sample application is called `medplum-hello-world`. The [source code](https://github.com/medplum/medplum-hello-world) is available, and it is recommended that you run it locally using [sample data](/docs/tutorials/importing-sample-data) to prototype your application.

Foo Medical Provider is intended as a sample, and the experience is truly up to the developer to determine. It is built off of the Medplum API, and is HIPAA compliant and SOC 2 Type 2 certified. Detailed compliance information can be found on our [compliance page](../docs/compliance).

## Common Features

A provider portal is optimized for the experience of the referring physician and enables better care coordination.

### Notifications

Sending notifications via email, SMS or via integration into tools is a common need for referring provider portals. For example, a referring physician might receive an email when the results of a diagnostic report for a patient are available. Medplum [bots](/docs/bots) support building notifications with custom logic, including deep linking to specific records on the provider portal so that referring physicians can have save time and clicks.

### Search

Sophisticated records search helps providers get to clarity on what's needed for patients. Medplum has a powerful [search API](/docs/search/basic-search) and [search SDK](/docs/sdk/core.medplumclient), [search input](https://storybook.medplum.com/?path=/docs/medplum-resourceinput--practitioners) and [search results control](https://storybook.medplum.com/?path=/docs/medplum-searchcontrol--checkboxes)

### Collaboration and Messaging

Commonly, providers want to have a discussion about a specific topic, for example - they might collaborate on a diagnostic report. Medplum supports structured communications using the `Communication.about` field. Threaded communications are also supported using `Communication.inResponseTo`. Read more about messaging and communications [here](../products/communications).

### Care Quality

Great communication and follow ups across specialties and primary care is crucial to care quality in general, and required for many value based care offerings. For example [CMS 50](/docs/compliance/onc) is called "Closing the Referral Loop: Receipt of Specialist Report." A provider portal can help enable this scenario.

### Audits and Logging

Because the provider portal is built off of the Medplum backend, it inherits all of the logging and audit infrastructure available on Medplum.

## Access Controls

Medplum supports sophisticated access controls, allowing administrators to control physician access to certain FHIR resources, for example only DiagnosticReports, or only specific groups of patients. [Learn More](/docs/auth)

## API Access

Giving partner institutions access via API is a common scenario. Medplum supports giving access to a [FHIR API](/docs/api/fhir), and white labeling it so that it is run off a customer domain.

## Billing and Revenue Cycle Scenarios

Commonly in diagnostics and specialty care providers are not part of the same professional corporation due to geographic or institutional restrictions. Data can be routed and tagged for [billing](../products/billing) using [bots](/docs/bots).

## Case Studies

- [At Home Diagnostics - Ro Case Study](/blog/ro-case-study)
- [Value Based Care and Elderly Populations - Ensage Case Study](/blog/ensage-case-study)

## Demos and Resources

- [Compliance](/docs/compliance) portal with guides and resources.
- [Access Controls](/docs/access/access-policies)
- [Authentication Methods](/docs/auth)
- [Communications Product](../products/communications)
- [Search API](/docs/search)
- [Bots for custom notifications](/docs/bots)

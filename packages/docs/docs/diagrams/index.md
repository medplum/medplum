---
sidebar_position: 1
---

# System Diagram

Use the system diagram and materials on this site to plan, research and guide your implementation. This is a **numbered system diagram** that outlines all system elements. Please refer to the numbered resources for materials.

![System diagram](/img/products/detailed-medplum-system-diagram.png)

## Resource Links and Reference

### Sample Applications

1. Patient Facing Application

- Blueprint on [Patient Portal](/blueprints/patient-portal)
- Sample Application: [Foo Medical](/blueprints/patient-portal)
- Foo Medical [source code on Github](https://github.com/medplum/foomedical)
- [React Component Library](/docs/api/react-components) is used throughout
- Medplum [JS SDK](/docs/sdk) powers the Foo Medical Sample App

2. Provider Facing Application

- Blueprints on [Custom EHR](/blueprints/custom-ehr), [Provider Portal](/blueprints/provider-portal)
- Sample Application: [Foo Medical Provider](https://provider.foomedical.com/)
- Foo Medical Provider [source Code on Github](https://github.com/medplum/foomedical-provider)
- [React Component Library](/docs/api/react-components) is the primary user experience

3. Dashboard, engineering and operations facing applications

- Sample Application [Medplum App](https://app.medplum.com) which is designed for developers
- Medplum App [source Code on Github](https://github.com/medplum/medplum/tree/main/packages/app)
- [Tutorial on Medplum App](/docs/tutorials/app)
- [React Component Library](/docs/api/react-components) powers this whole application

### Interop and Automation

Overall, interoperability and automation is implemented via Medplum Bots. Read more on [bots tutorials](/docs/tutorials/bots) or view source code and tests via [sample bots on Github](https://github.com/medplum/medplum-demo-bots).

4. FHIR Interoperability

- [API Documentation](/docs/api/fhir)
- [Sample Application](https://github.com/medplum/medplum-oauth-demo), using Medplum as an identity provider

5. HL7 Interoperability

- Tutorial on [Processing HL7 Messages](/docs/tutorials/bots/hl7-into-fhir)
- Source Code for [HL7 Processing Bot on Github](https://github.com/medplum/medplum-demo-bots/blob/main/src/examples/hl7-bot.ts)

6. SFTP Interoperability

- [Tutorial on SFTP](/docs/tutorials/bots/file-uploads#sftp-uploads)
- [Source Code on Github](https://github.com/medplum/medplum-demo-bots/blob/main/src/examples/sftp-upload.ts) for Logging into SFTP
- Tutorial on [secrets management in Bots](/docs/tutorials/bots/bot-secrets)

7. REST Interoperability

- Tutorial on [consuming webhooks (3PL Example)](/docs/tutorials/bots/logistics-into-ehr)
- Trigger a bot [via the $execute endpoint](/docs/tutorials/bots/bot-basics#using-the-execute-endpoint)

8. Binary Interoperability

- Tutorial on [file upload via bots](/docs/tutorials/bots/file-uploads)
- Tutorial on [creating a PDF via bots](/docs/tutorials/bots/creating-a-pdf)

9. Other

A common workflow is to create and update FHIR resources based off of a custom questionnaire.

- Tutorials on [automation via FHIR questionnaire](/docs/tutorials/bots/bot-for-questionnaire-response)
- View questionnaires on [Medplum App](https://app.medplum.com/Questionnaire)

### Infrastructure

10. Identity and Authorization

- [All authentication tutorials](/docs/tutorials/authentication-and-security)
- [API Documentation](/docs/api/oauth)
- [Access policies tutorial](/docs/tutorials/security/access-control)
- [User FHIR resource](/docs/api/fhir/medplum/user)
- [Project Membership](/docs/api/fhir/medplum/projectmembership)

11. Subscriptions

- Tutorial on [subscriptions](/docs/tutorials/api-basics/publish-and-subscribe)
- View Subscriptions on [Medplum App](https://app.medplum.com/Subscription)

12. Datastore

- [API documentation](/docs/api)
- [FHIR Resources List](/docs/api/fhir/resources)
- [Read resource history](/docs/sdk/classes/MedplumClient#readhistory)
- [Resource graph](/docs/sdk/classes/MedplumClient#readresourcegraph) shows how to query

13. FHIR REST API

- [FHIR Basics](/docs/fhir-basics)
- API Documentation [Resource Types](/docs/api/fhir/resources)
- API Documentation [Javascript SDK](/docs/sdk/classes/MedplumClient)
- [Batch API](/docs/sdk/classes/MedplumClient#batch)
- Coming Soon: Batch tutorial

14. Logging and Observability

- Coming Soon: Logging and observability tutorial
- API Documentation: [AuditEvent](/docs/api/fhir/resources/auditevent)
- Sample code [FHIRPath Demo on Github](https://github.com/medplum/medplum-fhirpath-demo)
- Sample code [medplum-notebooks on Github](https://github.com/medplum/medplum-notebooks) enables a Jupyter Notebooks experience

## Content Guide

There are several types of content and documentation available. Implementations can be complex and we hope to make it straightforward to find what you are looking for. Please reach out on our [Discord Community](https://discord.gg/UBAWwvrVeN) or at hello@medplum.com with questions.

In general, content is written for a technical audience, but can be useful for administrative, clinical, legal and compliance stakeholders as well.

| Documentation Type                                                       | Useful to                         | Considerations                                                    |
| ------------------------------------------------------------------------ | --------------------------------- | ----------------------------------------------------------------- |
| [Product Pages](/products)                                               | Administrative, product, clinical | Material for planning or diligence                                |
| [Blueprints](/blueprints)                                                | Administrative, product           | Describes end-to-end products that can be built                   |
| Sample Applications                                                      | Product, engineering              | Demonstrates what an implementation could look like               |
| [Tutorials](/docs/tutorials)                                             | Engineering, compliance, clinical | Guides that show how to implement specific features and scenarios |
| [API Documentation](/docs/api)                                           | Engineering                       | Functional documentation                                          |
| [Source Code](https://github.com/medplum?q=&type=public&language=&sort=) | Engineering, compliance           | Example code, reference for debugging and diligence               |

---
slug: flexpa-case-study
title: Flexpa - sync health history to apps
authors:
  name: Joshua Kelly
  title: Flexpa CTO
  url: https://github.com/jdjkelly
  image_url: https://github.com/jdjkelly.png
tags: [billing, fhir-datastore, self-host]
---

# Flexpa - sync health history to apps

Claims data is a uniquely rich source of financial and clinical data important to many healthcare workflows. The EDI 837 Health Care Claim transaction is one of the oldest forms of electronic data exchange, stemming from being defined as a required data transmission specification by HIPAA. 

Today, we are showcasing [Flexpa](https://www.flexpa.com/) which connects applications to claims data via direct patient consent and a modern FHIR API powered by Medplum.

<iframe width="560" height="315" src="https://www.youtube.com/embed/DsdLq6DGi-0?start=0" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>

## How does it work?
Flexpa aggregates and standardizes Patient Access APIs created by payers as required by CMS-9115-F. First, patients authenticate and consent to a data-sharing request from an application.

Then, Flexpa extracts, transforms, and loads payer responses into a normalized FHIR dataset. Flexpa stores data in a temporary FHIR server cache during the period for which a patient has granted access.

Finally, applications receive a patient-specific authorization response which can be used to retrieve data from a FHIR API provided by Flexpa – powered by Medplum.

![Flexpa](/img/blog/flexpa.png)

## What problems does Flexpa solve?

Payer FHIR servers offer an extremely variable API experience and implementing against 200+ of them is painful. Using Medplum as a data cache for their own FHIR API allows for a uniform developer experience on top of the underlying network access. Flexpa allows developers to use claims data to deliver risk factor adjustment scoring to value-based care providers, help patients navigate care, join clinical trials, negotiate bills, and more.

## How does Flexpa use Medplum?

Flexpa takes advantage of several important features of Medplum’s FHIR implementation: 

- [Self-hosting](/docs/self-hosting)
- [Multi-tenant through Projects](/docs/auth/user-management-guide#background-user-model) 
- [Update as Create](/docs/sdk/core.medplumclient.createresourceifnoneexist)
- Client assigned IDs
- [Batch](/docs/fhir-datastore/fhir-batch-requests) transactions
- [Medplum App](/docs/app)
- FHIR Operations such as [$validate](/docs/api/fhir/operations/validate-a-resource), [$everything](/docs/api/fhir/operations/patient-everything) and [$expunge](/docs/fhir-datastore/deleting-data#expunge-operation)

Medplum’s open source implementation provides Flexpa with the ability to contribute back to the project when improvements or changes are required. Additionally, Medplum’s technology choices and stack align perfectly with Flexpa’s making working with Medplum easy for Flexpa’s development team.

## Related Resources

- [Flexpa](https://www.flexpa.com/) website
- [Flexpa Blog](https://www.flexpa.com/blog)
- [CMS FHIR](/docs/compliance/cms-fhir) compliance documentation

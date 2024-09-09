---
sidebar_position: 3
sidebar_label: Import Sample Data
---

# Import Sample Data

When starting development, it can be really useful to have some sample data to work with, and to test your application. This tutorial will walk you through importing sample FHIR data into your Medplum project to aid in building a realistic application.

:::tip The Medplum App

The Medplum app is an administrative console, where developers can view their Medplum data, audit resource changes, and configure project settings. Most Medplum users do not use the Medplum app for patient or physician workflows, but rather build customized experiences or build on Medplum's example applications.

Read more about the Medplum App [here](/docs/app)

:::

## Download JSON Files

Below are resources belonging to two patients. This is FHIR data constructed in accordance with the [USCDI Data Element](/docs/fhir-datastore/understanding-uscdi-dataclasses) standards. That means that the FHIR Resources provided are tagged with the right [CodableConcepts](/docs/fhir-basics#standardizing-data-codeable-concepts) and ontologies to match the interoperability requirements for an EHR in the US.

Download one or both of the following files:

| Data      | Download                                                                                                    |
| --------- | ----------------------------------------------------------------------------------------------------------- |
| Patient 1 | [Patient 1 Download](https://drive.google.com/file/d/1bEyKSy55k9ZrrDLBj1NkHyL4ou75_eRX/view?usp=sharing)    |
| Patient 2 | [Patient 2 Download](https://drive.google.com/file/d/1Zj3EWeWj7-wP52CAZjSqzwCxZMlx6QZM/view?usp=share_link) |

## Batch Upload Tool

Log into Medplum and navigate to the [batch create](https://app.medplum.com/batch) tool. Upload the files you downloaded in the previous section.

:::caution Note

**Do not upload files twice.** If you aren't sure whether the upload worked, go to the [Patient](https://app.medplum.com/Patient) page. If you see a patient there - it worked.

:::

![Batch create tool](/img/tutorials/batch-create.png)

The batch upload tool is a lightweight wrapper around the [batch/transaction api](https://www.hl7.org/fhir/http.html#transaction) and here is the documentation on how to [upload a batch using the SDK](/docs/sdk/core.medplumclient.executebatch).

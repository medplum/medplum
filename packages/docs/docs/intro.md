---
sidebar_position: 1
---

# Intro

Welcome to Medplum. Building on Medplum enables **flexible and rapid development** of healthcare apps.

## Basic Concepts

Developing on Medplum is very similar to web development, but has built in compliance and interoperability features that are requirements for healthcare apps.

The Medplum basics are as follows:

- **Database**: a clinical data repository (CDR) that stores all data natively in FHIR. This includes support for binary files like images and videos.
- **[Web Application](https://app.medplum.com)**: where users can log in and create and update data. It also has an audit log.
- **Application Programming Interface (API)**: ability to create and update FHIR objects in the CDR programatically
- **[User Interface Library](https://docs.medplum.com/storybook/index.html?path=/story/medplum-introduction--page)**: interface components for representing FHIR objects
- **Subscriptions**: notifications when objects are created or updated, this is implemented using the FHIRPath spec
- **Identity Management and Permissions**: manage user identities and access to data

## Common Use Cases

These building blocks enable a large number of potential applications. For example:

- Lab Orders and Results Reporting via API
- Telemedicine web and mobile app
- Population health analysis, clinical research and HEDIS reporting
- External data warehousing
- Synthetic data set showcasing for partnership and prototyping
- Adding a FHIR API to an existing medical application

Stay tuned: we will post detailed implementation guides for all of these scenarios, including sample code.

## Get Started

The Medplum API is available at https://api.medplum.com

The OAuth2 base URL is https://api.medplum.com/oauth2/

The FHIR base URL is https://api.medplum.com/fhir/R4/

Get started right away, you can [register here](https://app.medplum.com/register). If needed, Medplum also supports self-hosting, get find the [source code](https://github.com/medplum/medplum) on Github.

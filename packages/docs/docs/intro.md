---
sidebar_position: 1
---

# Intro

Welcome to Medplum. Building on Medplum enables **flexible and rapid development** of healthcare apps.  Medplum is [open source](https://github.com/medplum/medplum).

## Basic Concepts

Developing on Medplum is very similar to web development, and has built in interoperability and compliance features that are requirements for healthcare apps.

The Medplum basics are as follows:

- **Datastore**: a clinical data repository (CDR) that stores all data natively in FHIR. This includes support for binary files like images and videos
- **Application Programming Interface (API)**: ability to create and update FHIR objects in the datastore programatically
- **Subscriptions**: notifications when objects are created or updated, this is implemented using the FHIRPath spec
- **Identity Management and Access Policies**: manage user identities and access to data
- **Intgration and Workflow through Bots**: automation and interoperability tools for sending data to and from other applications

Medplum offers the following tools to enhance the developer experience:

- **[Web Application](https://app.medplum.com)**: where users can log in, get API keys, create and update data. It also enables account management and has an audit log
- **[SDKs](https://docs.medplum.com/sdk)**: smooth common create, update, and search operations
- **[User Interface Library](https://docs.medplum.com/storybook/index.html?path=/story/medplum-introduction--page)**: interface components for representing FHIR objects
- **[Sample Code](https://github.com/medplum)**: reference implementations and sample code for many complex scenarios

## System Overview

The following diagram shows how all of these pieces fit together.

![Medplum system overview](/img/medplum-overview.svg)

## Common Use Cases

These building blocks enable a large number of potential applications. For example:

- At home lab testing service, with results reporting via API
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

Get started right away, you can [register here](https://app.medplum.com/register). If needed, Medplum also supports self-hosting, get the [source code](https://github.com/medplum/medplum) on Github.

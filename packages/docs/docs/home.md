---
slug: /
sidebar_position: 1
---

import HomepageCallout from '@site/src/components/HomepageCallout'

# Welcome to Medplum!

<section className="homepage-grid">
    <HomepageCallout title="Get Started" body="Write your first medical application in 5 minutes" linkText="Read more" linkRef="/tutorials/api-basics/create-fhir-data" />
    <HomepageCallout title="API Docs" body="Reference documentation about Medplum's client API for reading and writing healthcare data" linkText="Read more" linkRef="/api" />
    <HomepageCallout title="Use Cases" body="See how to apply Medplum against your healthcare problem" linkText="Read more" linkRef="#" />
    <HomepageCallout title="Basic Concepts" body="Learn the basic concepts behind Medplum and the FHIR standard for healthcare data" linkText="Read more" linkRef="#" />
</section>

## What is Medplum?

Medplum is a **developer platform** that enables **flexible and rapid development** of healthcare apps. In consists of the following components:

1. **Medplum Clinical Data Repository (CDR)** - This is the the backend server and data store that hosts your healthcare data in a secure, compliant, and standards based repository.
2. **Medplum API** - The Medplum CDR also exposes a **[FHIR-based API](/api)** for sending, receiving, and manipulating healthcare data. This includes support for binary files like images, videos, and pdfs.
3. **Medplum SDK** - This is a set of client libraries that simplify the process of interacting with the **Medplum API**. Currently, we only offer a **Typescript** library, but are planning to support more languages in the future. If there's a language you'd like supported, feel free to open a [Github Issue](https://github.com/medplum/medplum/issues).
4. **Medplum App** - This is a web application where can you can view your data, perform basic editing tasks. You can also use the Medplum App to manage basic workflows.
5. **UI Component Library** - Medplum ships with a system of [React components](/tutorials/react-components/hello-world-part-1) designed to help you quickly develop custom healthcare applications

## Getting Started

- Get started right away, you can [register here](https://app.medplum.com/register). If needed, Medplum also supports [self-hosting](self_hosting), get the [source code](https://github.com/medplum/medplum) on Github.
- The [Basic Concepts](/fhir-basics) page provides a good primer on Medplum and contains important information about the FHIR, the healthcare data standard on which Medplum is built.
- If you're ready to start coding, use our [Quickstart Guide](/tutorials/api-basics/create-fhir-data) to get up and running
- Our detailed tutorials go step-by-step through specific use cases. Don't see a tutorial you need? Reach out on our [Discord](https://discord.gg/UBAWwvrVeN) or send us an email at [support@medplum.com](mailto:support@medplum.com)

## Common Use Cases

These building blocks enable a large number of potential applications. For example:

- At home lab testing service, with results reporting via API
- Telemedicine web and mobile app
- Population health analysis, clinical research and HEDIS reporting
- External data warehousing
- Synthetic data set showcasing for partnership and prototyping
- Adding a FHIR API to an existing medical application

Stay tuned: we will post detailed implementation guides for all of these scenarios, including sample code.

## Key Features

- **[Subscriptions](fhir-basics#subscriptions-listening-for-changes)**: notifications when objects are created or updated, this is implemented using the FHIRPath spec
- **[Identity Management and Access Policies](app/access-control)**: manage user identities and access to data
- **[Integration and Workflow Automation](tutorials/bots/intro)**: Bots are powerful automation and interoperability tools for sending data to and from other applications

## System Overview

The following diagram shows how all of these pieces fit together.

![Medplum system overview](/img/medplum-overview.svg)

## Community

- **Contributing** - Medplum is open source because we believe that streamlining healthcare is based on _transparency_ and _collaboration_. If you are interested contributing to Medplum, check out our [Contributors](/contributing) page
- **Discord** - Join the conversation by checking us out on [Discord](https://discord.gg/UBAWwvrVeN)

---
slug: /
sidebar_position: 1
---

import HomepageCallout from '@site/src/components/HomepageCallout'

# Welcome to Medplum

<section className="homepage-grid">
    <HomepageCallout title="Get Started" body="Write your first medical application in 5 minutes" linkText="Read more" linkRef="./docs/tutorials" />
    <HomepageCallout title="API Docs" body="Reference documentation about Medplum's client API for reading and writing healthcare data" linkText="Read more" linkRef="./docs/api" />
    <HomepageCallout title="Blueprints" body="See how to apply Medplum against your healthcare problem" linkText="Read more" linkRef="./blueprints" />
    <HomepageCallout title="Basic Concepts" body="Learn the basic concepts behind Medplum and the FHIR standard for healthcare data" linkText="Read more" linkRef="./docs/fhir-basics" />
</section>

## What is Medplum?

Medplum is a **developer platform** that enables **flexible and rapid development** of healthcare apps. In consists of the following components:

1. **Medplum Auth** - End-to-end identity solution for easy user authentication, sign-in, and permissions using OAuth, OpenID, and SMART-on-FHIR.
2. **Medplum Clinical Data Repository (CDR)** - Backend server that hosts your healthcare data in a secure, compliant, and standards based repository.
3. **Medplum API** - **[FHIR-based API](./docs/api)** for sending, receiving, and manipulating data.
4. **Medplum SDK** - Client libraries that simplify the process of interacting with the **Medplum API**. Currently, we only offer a **Typescript** library, but are planning to support more languages in the future. If there's a language you'd like supported, feel free to open a [Github Issue](https://github.com/medplum/medplum/issues).
5. **Medplum App** - Web application where you can view your data, perform basic editing tasks. You can also use the Medplum App to manage basic workflows.
6. **Medplum Bots** - Write and run application logic server-side without needing to set up your own server.
7. **UI Component Library** - [React components](./docs/ui-components/) designed to help you quickly develop custom healthcare applications.

## Getting Started

- Get started right away, you can [register here](https://app.medplum.com/register). If needed, Medplum also supports [self-hosting](./docs/self-hosting), get the [source code](https://github.com/medplum/medplum) on Github.
- The [Basic Concepts](./docs/fhir-basics) page provides a good primer on Medplum and contains important information about the FHIR, the healthcare data standard on which Medplum is built.
- If you're ready to start coding, use our [Quickstart Guide](./docs/tutorials) to get up and running
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

- **[Subscriptions](./docs/subscriptions)**: notifications when objects are created or updated, this is implemented using the FHIRPath spec
- **[Identity Management and Access Policies](./docs/auth)**: manage user identities and access to data
- **[Integration and Workflow Automation](./docs/bots)**: Bots are powerful automation and interoperability tools for sending data to and from other applications

## System Overview

The following diagram shows how all of these pieces fit together.

![Medplum system overview](/img/medplum-overview.svg)

## Community

- **Contributing** - Medplum is open source because we believe that streamlining healthcare is based on _transparency_ and _collaboration_. If you are interested contributing to Medplum, check out our [Contributors](./docs/contributing) page
- **Discord** - Join the conversation by checking us out on [Discord](https://discord.gg/UBAWwvrVeN)

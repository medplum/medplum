---
slug: /
sidebar_position: 1
---

import HomepageCallout from '@site/src/components/HomepageCallout'

# Welcome to Medplum!

<section className="homepage-grid">
    <HomepageCallout title="Get Started" body="Write your first medical application in 5 minutes" linkText="Read More" linkRef="/intro" />
    <HomepageCallout title="API Docs" body="Reference documentation about Medplum's client API for reading and writing healthcare data" linkText="Read More" linkRef="/api/overview" />
    <HomepageCallout title="Use Cases" body="See how to apply Medplum against your healthcare problem" linkText="Read More" linkRef="#" />
    <HomepageCallout title="Basic Concepts" body="Learn the basic concepts behind Medplum and the FHIR standard for healthcare data" linkText="Read More" linkRef="#" />
</section>

## What is Medplum?

Medplum is a developer platform that enables **flexible and rapid development** of healthcare apps. In consists of 3 main components

1. **Medplum Clinical Data Repository (CDR)** - This is the the backend server that hosts your healthcare data in a secure, compliant, and standards based respository. The Medplum CDR also exposes a [FHIR-based API](/api/overview) for sending, receiving, and manipulating data
2. **Medplum App** - This is a web application where can you can view your data, perform basic editing tasks. You can also use the Medplum App to manage basic workflows.
3. **UI Component Library** - Medplum ships with a system of [React components](/tutorials/react-hello-world/hello-world-part-1) designed to help you quickly develop custom healthcare applications

## Getting Started

- The [Basic Concepts](/intro) page provides a good primer on Medplum and contains important information about the FHIR, the healthcare data standard on which Medplum is built.
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

## Community

- **Contributing** - Medplum is open source because we believe that streamling healthcare is based on _transparency_ and _collaboration_. If you are interested contributing to Medplum, check out our [Contributors](/contributing/intro) page
- **Discord** - Join the conversation by checking us out on [Discord](https://discord.gg/UBAWwvrVeN)

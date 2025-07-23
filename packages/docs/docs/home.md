---
slug: /
sidebar_position: 1
---

import HomepageCallout from '@site/src/components/HomepageCallout'

# Welcome to Medplum

<section className="homepage-grid">
    <HomepageCallout title="Get Started" body="Set up and run your medical application in 5 minutes" linkText="Read more" linkRef="./docs#get-started" />
    <HomepageCallout title="Plan your Workflows" body="Learn FHIR and plan your workflows" linkText="Read more" linkRef="./docs#plan-your-workflows" />
    <HomepageCallout title="Build in Medplum" body="Medplum tools for full-stack apps with authentication" linkText="Read more" linkRef="./docs#build-in-medplum" />
    <HomepageCallout title="Connect to the Healthcare Ecosystem" body="Use our on-prem Agent and integrations, for HL7, FHIRcast, labs/prescribing, and beyond" linkText="Read more" linkRef="./docs#connect-to-the-healthcare-ecosystem" />
</section>

## What is Medplum?

Medplum is a **headless EHR**. Using [Medplum products](./products) you can build many [types of healthcare applications](./solutions). The diagram below is a system overview:

![Medplum system overview](/img/medplum-overview.svg)

## Get Started

1. [Register an account](https://www.medplum.com/docs/tutorials/register) to get a project provisioned. 
    1. [Optional]: [Import sample data](https://www.medplum.com/docs/tutorials/importing-sample-data). 
2. View and use our [provider app](https://www.medplum.com/docs/provider) by [logging in](https://provider.medplum.com/) to use our out-of-the-box provider experience. 
3. [Build your own application](https://www.medplum.com/docs/tutorials/medplum-hello-world) against our APIs. 

## Plan your Workflows

1. [Learn FHIR basics](./docs/fhir-basics) to understand the structure of FHIR resources, the healthcare standard on which Medplum is built. 
2. [Learn workflow patterns](./blog/fhir-workflow-patterns-to-simplify-your-life) to understand how resources are used to request actions, record events, and store information. 
3. Explore our docs on workflows under "Model in FHIR"! Popular workflows are included below. Step through specific use cases. Don't see a how-to guide you need? Reach out on our [Discord](https://discord.gg/medplum) or send us an email at [support@medplum.com](mailto:support@medplum.com). 
    1. [Charting patient data](./docs/charting)
    2. [Creating and automating clinical operations](/docs/careplans/tasks)
    3. [Recording asynchronous encounters and messaging](./docs/communications/async-encounters)
    4. [Billing your services](./docs/billing)

## Build in Medplum

1. [CRUD using our FHIR datastore](./docs/fhir-datastore), and learn to [search your data](./docs/search).
2. Explore our [React components](./docs/api/react), pre-built to support Medplum data.  
3. [Run the Medplum stack locally](./docs/self-hosting/running-full-medplum-stack-in-docker), or [self-host](./docs/self-hosting) your own Medplum server with our [source code](https://github.com/medplum/medplum) on Github.

## Connect to the Healthcare Ecosystem

- Get on-prem connectivity with our [Medplum Agent](./docs/agent), connecting to devices over HL7/MLLP, ASTM, and DICOM and surfacing them securely to the cloud. 
    - We also support [FHIRcast](./docs/fhircast) for real-time synchronization. 
- Use our out-of-the-box [labs](./docs/integration/health-gorilla), [prescribing](./docs/integration/dosespot), and [RCM](./docs/integration/stedi) integrations. 
- Explore our [full menu of integrations](./docs/integration).

## Reference Material

Medplum is [open source](https://github.com/medplum/medplum), [reference material](/docs/api/index.md) and [sample applications](https://github.com/medplum) are available for browsing unauthenticated.

## Community

- **Contributing** - Medplum is open source because we believe that streamlining healthcare is based on _transparency_ and _collaboration_. If you are interested in contributing to Medplum, check out our [Contributors](./docs/contributing) page
- **Discord** - Join the conversation by checking us out on [Discord](https://discord.gg/medplum)
- **Youtube** - Our [Youtube Channel](https://www.youtube.com/channel/UCu_sS6aXEHz3GPk2NTugtJA) includes content that aids in app development

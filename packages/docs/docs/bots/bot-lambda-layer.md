---
sidebar_position: 2000
tags: [bots, self-host]
---

# Medplum Bot Layers

## Overview of Medplum Bots

Medplum Bots are functions that execute upon specific triggers. Think of them as AWS Lambda functions optimized for the Medplum environment. They are written, deployed, and triggered via FHIR Subscriptions, streamlining various integrations in Medplum.

## Introduction to AWS Lambda Layers

Lambda Layers are .zip file archives that contain additional code or data, primarily used for library dependencies, custom runtimes, or configuration files. The reasons to use Lambda Layers are practical:

1. **Size Management**: By moving function dependencies to a layer, deployment packages remain smaller.
2. **Code Organization**: Layers allow for separation between core function logic and its dependencies. This means either can be updated independently.
3. **Dependency Sharing**: Layers make it possible to set up dependencies once and use them across multiple functions.
4. **Utilizing Lambda Console Code Editor**: For quick code edits, the editor is useful but has limitations with larger deployment packages. Layers can help mitigate this size issue.

## How Medplum Uses Lambda Layers

Medplum's process for Lambda Layers is straightforward:

- **Layer Creation**: We take the predefined dependencies' pinned version, organize them into the required folder structure, and then upload to AWS.
- **Publication**: Bot Layers don't follow the typical Medplum update cycle, which is post every Git commit. Instead, we update Bot Layers with our release versions, approximately once a week. This aligns with the update frequency of some dependencies in the NPM central repository.

## A Note for Self-Hosters

If you're hosting Medplum on your own infrastructure, remember that Bot layers don't auto-publish. To update the Bot Layer:

1. [Clone the Medplum Repo](/docs/contributing/local-dev-setup) (**Note:** You can clone the main Medplum repo instead
   of creating a fork)
2. [Build the Project](/docs/contributing/run-the-stack)
3. Deploy: Utilize `./scripts/deploy-bot-layer.sh` to deploy the new version.

## Learn More

- [Working with Lambda layers](https://docs.aws.amazon.com/lambda/latest/dg/chapter-layers.html)
- [Creating and sharing Lambda layers](https://docs.aws.amazon.com/lambda/latest/dg/configuration-layers.html)

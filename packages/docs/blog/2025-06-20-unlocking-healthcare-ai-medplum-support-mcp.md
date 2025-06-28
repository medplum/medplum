---
slug: unlocking-healthcare-ai-medplum-support-mcp
title: "Medplum Support for Anthropic's Model Context Protocol (MCP)"
authors: cody
tags: [self-host, fhir-datastore, integration, compliance, auth, community, ai]
---

# Medplum Announces Initial Support for Anthropic's Model Context Protocol (MCP)

Medplum is the platform of choice for technical leaders in healthcare, and that has given us a unique perspective into the transformative power of AI in healthcare - we get asked about it every single day.  

We know that technical leaders feel the pressure to define and execute on an AI strategy, and to demonstrate tangible progress to teams and stakeholders, that's expected in times of rapid technical advances.  

That's why we're thrilled to announce our beta support for Anthropic's **Model Context Protocol (MCP)**, marking a significant leap forward in how large language models (LLMs) can securely and intelligently interact with healthcare infrastructure and systems of record.

<div className="responsive-iframe-wrapper">
<iframe width="560" height="315" src="https://www.youtube.com/embed/y3gD7TQ-SM8" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>
</div>

<!--truncate-->

## What is the Model Context Protocol (MCP)?
Think of the Model Context Protocol (MCP) as the **universal adapter for AI applications**. Developed by Anthropic, MCP is an open standard designed to standardize how AI models, particularly LLMs, connect with and utilize external tools, systems, and data sources.  

**MCP provides a structured way for LLMs to understand and interact with the outside world**, moving beyond simple text generation to actual, actionable engagement with your existing infrastructure.

For healthcare, this is a game-changer due to the rigors of the workflow. Imagine LLMs not just summarizing information, but intelligently querying patient data (securely and appropriately), managing workflows, or even orchestrating integrations with medical devices. That's the promise of MCP.

## Medplum's Next Step: Empowering Intelligent Healthcare Applications with MCP

Our initial support for MCP leverages the official TypeScript SDK, with a focus on cloud-native interactions via SSE (Server-Sent Events) and Streamable HTTP. While the MCP team is pushing for Streamable HTTP, we're currently supporting both to ensure compatibility with major LLM vendors. 

The real power we're unlocking comes from our custom `fhir-request` tool, exposed through our MCP API. This tool allows an LLM to invoke almost any function within the Medplum API, because nearly everything in Medplum is exposed as **FHIR resources and operations**.

Here's a glimpse of what you can do:  

**Intelligent Data Retrieval**: Imagine an LLM securely searching for synthetic patient data, reading specific observations, or getting conditions lists.  
**Automated Workflows**: LLMs can initiate and manage healthcare processes, like creating a new task, scheduling an appointment, or marking a task as completed.  
**Complex Operations**: Beyond standard FHIR resources, our fhir-request tool enables LLMs to trigger Medplum's powerful integrations and FHIR operations, such as submitting a Claim via $submit.

We're particularly optimistic about this pattern because **LLMs already have a strong understanding of FHIR**, allowing them to adapt to our API naturally and with surprising accuracy.  

This capability is enhanced when combined with [Medplum Bots](/docs/bots). These are JavaScript/TypeScript snippets that run in response to triggers – imagine an LLM orchestrating a workflow that a Medplum Bot then executes, like deploying another Bot or executing a complex operation (`/Bot/{id}/$deploy`, `/Bot/{id}/$execute`).  

And for those deeply embedded in existing healthcare infrastructure, our [Medplum Agent](/docs/agent) takes this even further. The Agent provides on-premise connectivity to EHRs, LIS, RIS, PACS, and other devices. With MCP, an LLM could intelligently construct an HL7 v2 message and push it directly to an on-premise destination via `/Agent/{id}/$push` – that's truly sending data from the LLM chat to the front lines of healthcare delivery!

## Why This Matters: Staying Ahead in AI

For healthcare technical leaders, the message is clear: AI is no longer a distant future; it requires action today. The pressure to innovate and integrate AI into your healthcare strategy is real. Medplum's support for MCP offers a unique opportunity to:  

**Experiment Safely and Intelligently**: Get hands-on with cutting-edge AI integration without starting from scratch.  
**Demonstrate Rapid Progress**: Show your teams and leadership how AI can tangibly interact with healthcare data and workflows, even with experimental, de-identified data.  
**Build Future-Proof Architectures**: By embracing open standards like MCP, you're positioning your organization to seamlessly adopt the next generation of AI capabilities.  
**Attract Top Talent**: Signal that your organization is at the bleeding edge, embracing new technologies and solving complex problems.

We know you're looking for ways to leverage AI now to drive innovation and efficiency. Medplum, with MCP, provides a powerful pathway to explore these possibilities.

## Responsible Innovation: Experimental Technology Ahead

We are a healthcare company first and foremost, and that means prioritizing patient safety and data security above all else. Most major LLM vendors do not yet support HIPAA Business Associate Agreements (BAAs), and the landscape around production-grade, HIPAA-compliant AI integrations is still evolving rapidly.  

Therefore, it is absolutely critical to understand that Medplum's current MCP implementation is a preview release and is experimental technology.

- Do not use this for protected health information (PHI).  
- Use only with synthetic, de-identified, or test data.  
- No guarantees are made about uptime or suitability for production workloads.  
- Proceed with caution and exercise your best judgment.

Our commitment is to be a forward-leaning "high tech" player in healthcare. This means we make investments to get out in front of new technology trends, enabling you to explore future possibilities today. We're excited to offer this capability, but always with emphasis on responsible and ethical use.

## Join Medplum's MCP Beta Today

The current MCP implementation is available to all Medplum users. We encourage you to dive in and experiment!  

**Existing Medplum users**: Jump into your [Medplum project](https://app.medplum.com/) and start exploring our MCP capabilities. Look for the "beta" label and the associated disclaimers.  

**New to Medplum?** The first step is to [sign up for an account](/docs/tutorials/register) and go through our standard "Getting Started" flow. Once you're up and running, you'll have access to our MCP features.

We believe this initial support for MCP will spark incredible innovation. We can't wait to see what you build!

## How to Set it Up

* Open [Claude](https://claude.ai/) and log in, you'll need to be on a paid plan to add integrations
* Navigate to the [settings page](https://claude.ai/settings/profile) in the bottom left and then click on "Add Integration" on the Organization Integrations page.
* In the diaglog that opens input "Medplum" for the **Integration Name**, and "https://api.medplum.com/mcp/sse" for the **Integration URL** and click Add
* Back on the Organization integrations page, you'll see a button to **Connect**, click on it and it will redirect you to Medplum where you should authenticate
* You'll be redirected to the Integrations page where 
* Create a [New Chat](https://claude.ai/new) in Claude and paste the following

> can you please confirm you have access to the "fhir-request" MCP tool?

LLMs can cometimes cache sessions, so if you find yourself unable to connect you can disconnect and reconnect in a new chat in order to get back to a good state.

Feedback welcome at support@medplum.com or join our [Discord](https://discord.gg/medplum)
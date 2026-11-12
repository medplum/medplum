---
id: 2026-11-09-ai-coding-agents-on-medplum
slug: ai-coding-agents-on-medplum
title: 'Give Your Coding Agent a Head Start on Medplum'
description: 'Give your coding agent Medplum decision guides for planning healthcare workflows and persistent rules for implementing them consistently.'
authors: everett
blog_tags: [ai]
---

Put Medplum's **decision guides** to work in your coding agent. They help it ask the right questions about your healthcare workflow, explain the tradeoffs, and find a documented path to implementation. Pair them with our **persistent rules file** to carry Medplum's conventions into the next coding task.

Our expanded [AI coding guidance](/docs/building-with-ai-coding-assistants) shows how to connect these resources to your project:

<!--more-->

- **Decision guides: give the agent a foundation for planning.** Our [guides](/docs/decision-guides) connect questions about charting, scheduling, access control, and other healthcare workflows to tradeoffs and implementation docs. The agent can use them to uncover missing requirements, explain your options, and trace an agreed choice to a documented approach.
- **Persistent rules: carry Medplum conventions into later tasks.** The reusable [rules file](/ai/medplum-rules.md) directs agents to the relevant docs and calls out common mistakes, such as mixing FHIR versions or implementing access control through application filtering. Connect it to your project instructions so future sessions have the same guidance to work from.

These resources are useful whether you're vibe coding your first application or building an agentic development workflow for an engineering team. You bring the product requirements and review the decisions. Your agent gets Medplum-specific guidance for turning them into an implementation.

## Put it to work on a vital-signs form

Start with a short request:

> Help me plan a vital-signs form for an initial visit. We want blood pressure and heart rate; weight is optional.

The [Charting Decision Guide](/docs/decision-guides/charting) gives the agent a way to develop that request with you. How should the readings become queryable data? Does completing the form save the measurements, or also sign the visit? The [Access Control Decision Guide](/docs/decision-guides/access-control) helps work through who can read or change them.

Those questions shape the build. Saving measurements as Observations makes them queryable elsewhere in the application. Defining what completion means determines which workflow step advances when the form is submitted.

For this example, suppose the team agrees to save the readings as Observations linked to the patient and encounter, with visit signing handled separately. The agent can capture that agreement in `docs/decisions/charting.md` and turn it into checks: save the expected values and units, link the correct patient and encounter, and avoid creating an empty weight Observation when weight is omitted.

The guide also helps the agent recommend an implementation. Medplum's [Structured Data Capture extraction](/docs/questionnaires/parsing-questionnaire-responses) supports straightforward form mappings; requirements for scoring or external calls may lead to a Bot. The agent has a source for explaining that choice and the technical docs to follow once you've agreed on it.

The [planning instructions](/ai/planning.md) connect these steps: read the relevant guides, research technical questions, ask about missing requirements, and save the decisions alongside your code. An unanswered question, such as what happens when a required measurement cannot be obtained, stays open with the work it blocks identified.

## Keep Medplum's conventions in the loop

As the agent implements the form, the rules file gives it concrete instructions: use FHIR R4 types, read the relevant Medplum docs, and enforce access through AccessPolicy and ProjectMembership. It also calls for reviewing the implementation against the agreed requirements, type-checking, and running the relevant tests.

Make that guidance part of your project by referencing the rules from `AGENTS.md`, `CLAUDE.md`, or your tool's equivalent. The Medplum repository's own [AGENTS.md](https://github.com/medplum/medplum/blob/main/AGENTS.md) directs supported agents to the same resources; the [setup guide](/docs/building-with-ai-coding-assistants#5-encode-your-conventions-in-a-rule-file) shows how to connect them to your application. Confirm that your tool reads the references in a fresh session, and reload the relevant context after compaction.

## Give the next task the same context

Now ask for a change: make weight required.

The saved decision gives the next coding task a starting point. The agent can identify the previous requirement, clarify whether the change applies to existing visits, and update the decision, form, and tests together. If resource constraints change too, it should account for the affected profiles and any migration work.

For engineering teams, this creates a shared basis for coding and review. Each agent job can receive the same guides and rules at a pinned revision, together with the current project decisions. Engineers can review the result against those requirements and update the shared context as the product evolves.

## Bring it into your next coding session

Follow the [setup guide](/docs/building-with-ai-coding-assistants#plan-your-application) to give your agent access to Medplum's docs. You can use a local clone or an agent with web access to the public guides and rules.

Then pick a feature and start planning:

```text
Help me plan [feature] on Medplum.
Follow https://www.medplum.com/ai/planning.md, including its Medplum rules.
Start with our existing requirements, code, and decisions.
Ask about consequential gaps and explain the relevant tradeoffs.
Save our decisions and acceptance checks before implementation.
Ask before changing project instruction files.
```

Start with the [decision guide](/docs/decision-guides) for your next feature. Work through the choices with your agent, save the decisions, and use the rules to carry that context into the build.

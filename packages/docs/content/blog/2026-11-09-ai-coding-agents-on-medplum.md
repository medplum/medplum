---
id: 2026-11-09-ai-coding-agents-on-medplum
slug: ai-coding-agents-on-medplum
title: 'Helping AI Coding Agents Build on Medplum'
description: 'Use Medplum decision guides, agent rules, and saved project decisions to plan and implement healthcare workflows with AI coding agents.'
authors: everett
blog_tags: [ai]
---

“Add a vital-signs form to the initial visit” sounds like a straightforward request for a coding agent. Building it well requires a few more decisions: which measurements are required, how they become queryable clinical data, and who can read or change them. Those answers shape the implementation.

We've expanded Medplum's [AI coding guidance](/docs/building-with-ai-coding-assistants) to help agents work through those decisions with you. Decision guides supply the questions and tradeoffs. Planning instructions connect the answers to implementation. Reusable rules keep the agent pointed at Medplum's docs and your project's decisions.

This is useful whether you're vibe coding an early application or working on an engineering team that uses agents to accelerate development. You can start from Medplum's design guidance, keep agreed choices available between tasks, and review generated work against explicit requirements. The context lives alongside your code, ready for the next session or coding job.

<!--more-->

## Give your agent a Medplum starting point

In our [earlier post on vibe coding](/blog/building-on-medplum-with-ai), we recommended giving agents access to Medplum's open-source docs and code. We've since added instructions that help an agent use that material throughout development:

- **[Decision guides](/docs/decision-guides)** connect workflow questions to implementation options and technical documentation. They cover areas such as charting, scheduling, authentication, and access control, giving your agent a starting point for discovery.
- **[Planning instructions](/ai/planning.md)** tell the agent to read existing requirements, research technical questions, ask about consequential gaps, and save the answers. They also describe how to carry those decisions into implementation and update them when requirements change.
- **[Reusable Medplum rules](/ai/medplum-rules.md)** direct the agent to documented patterns and address common mistakes, including mixing FHIR versions, inventing fields, and applying access rules incorrectly.

The repository's root [AGENTS.md](https://github.com/medplum/medplum/blob/main/AGENTS.md) connects supported agents working in the Medplum clone to this guidance. For your own application, the setup workflow helps you reference the rules from the project instructions your tool loads, such as `AGENTS.md` or `CLAUDE.md`. Confirm that the agent reads those references in a fresh session; instruction loading varies by tool.

That gives implementers a reusable foundation: Medplum supplies the workflow questions and implementation references, while your team supplies the requirements for your application.

## Work through the vital signs example

Start with that request to add a vital-signs form. The [Charting Decision Guide](/docs/decision-guides/charting) helps the agent connect it to the surrounding visit workflow. Together with the access-control guidance, it gives the planning conversation concrete questions:

- Which measurements does this visit require, and which are optional?
- How should the submitted answers become structured data that other parts of the application can query?
- Who can enter, read, or amend those measurements?
- How does completing the form relate to signing the visit chart?

The agent should first read the requirements you've already provided, then ask about the gaps and explain what each answer changes. For example, a straightforward mapping from form answers to Observations may fit Medplum's Structured Data Capture extraction. Scoring logic or external service calls may call for a Bot. The [parsing documentation](/docs/questionnaires/parsing-questionnaire-responses) explains those choices.

For an illustrative initial-visit workflow, suppose the team agrees to require blood pressure and heart rate, make weight optional, and save measurements as Observations linked to the patient and encounter. Completing this form means saving the required measurements; signing the visit chart is a separate step. These choices belong to this example and should be confirmed for your own application.

The agent saves the decisions alongside the code, for example in `docs/decisions/charting.md`. Each entry records its status, rationale, implementation implications, and acceptance checks. A short excerpt might look like this:

| Status | Decision or question | What it changes |
| --- | --- | --- |
| Confirmed | Blood pressure and heart rate are required; weight is optional. | The form's required fields and checks for saved measurements. |
| Proposed | Use Structured Data Capture extraction for the form. | Confirm processing requirements before implementing extraction. |
| Open | Does the practice require a co-signature? | Finalizing the signing workflow and its acceptance tests. |

The distinction matters when work moves to another session or engineer. The next task can see what the team agreed, which recommendations still need a decision, and which questions block implementation.

## Implement and check the agreed behavior

Once the relevant decisions are settled, the agent can build from the saved record and the linked technical docs. For this form, that includes agreeing on extraction, resource constraints, and access before implementing the affected behavior.

If the team selects Structured Data Capture, the implementation uses annotations on the Questionnaire to map answers into resources. Medplum's `$extract` operation returns the populated resources for a separate save step. The agent should follow the documented write handling and check the results of those writes.

The saved requirements also give the implementation concrete checks: the measurements have the expected values and units, reference the correct patient and encounter, and conform to the selected profiles. Leaving optional weight blank should produce no empty weight Observation. Access tests should exercise allowed and denied actions using restricted users and synthetic records.

Medplum's rules direct agents to use FHIR R4 types, read the relevant docs, and run the project's checks. Type checks and profile validation cover different constraints; tests still need to verify the intended behavior. Engineers can use the saved decisions to review both the code and its tests, with particular attention to access control and data handling.

## Keep the context available as the application changes

Now suppose the team decides that weight must be required. The agent has a record of the previous choice and can identify the affected form and tests. It should clarify anything the new request leaves open, such as whether the change applies to existing visits, then update the decision and implementation together. If resource constraints also change, review the affected profiles, generated types, and migration needs.

References in your application's project instructions make those decisions available to later tasks. Reload the relevant docs and decisions after context compaction, and keep the references current as the application evolves.

Engineering teams can use the same materials in automated coding workflows. Provide the Medplum rules, relevant guides and technical docs at a pinned revision, and the current project decisions to each planning, implementation, or review job. Route blocking questions to the application owner and run the agreed checks before accepting a change. This gives engineers a consistent basis for assigning work to agents and evaluating the result.

## Try it on one feature

Start with the [AI coding setup guide](/docs/building-with-ai-coding-assistants#plan-your-application), then give your agent a focused request:

```text
Help me plan the initial visit's vital-signs form on Medplum.

Follow https://www.medplum.com/ai/planning.md, including its Medplum rules.
Start with our existing requirements, code, and decisions. Use the charting
and access-control decision guides to identify consequential gaps and
explain the implementation tradeoffs.

Save the decisions and acceptance checks in our application's repository
before implementation. Distinguish confirmed decisions, proposals, and
open questions. Ask before changing project instruction files.
```

A focused feature may need only one decision record. Start there, connect it to the instructions your agent reads, and use it to guide the next implementation and review.

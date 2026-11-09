---
id: 2026-11-09-ai-coding-agents-on-medplum
slug: ai-coding-agents-on-medplum
title: 'Teaching Coding Agents to Build Healthcare Workflows'
description: 'How Medplum helps coding agents ask useful implementation questions, save project decisions, and build from documented healthcare patterns.'
authors: everett
blog_tags: [ai]
---

A vital-signs form needs a rule for what happens when a required measurement cannot be obtained. That choice affects the form, the data it records, and what completing the workflow means. It's also a question a coding agent should raise when the requirements leave it open.

Medplum's implementation guides connect questions like these to data models, workflow choices, and working examples. We've expanded our [AI coding guidance](/docs/building-with-ai-coding-assistants) to make that knowledge easier for agents to use: research the relevant patterns, work through the decisions with you, and carry the answers into implementation.

Whether you're vibe coding an application or using agents within an engineering team, the benefit is practical. You can start from Medplum's guidance, keep your project's choices available between tasks, and review generated work against the requirements you agreed.

<!--more-->

## Start with the decisions behind the form

Consider this request:

> Help me plan a vital-signs form for an initial visit. We want blood pressure and heart rate; weight is optional.

The [Charting Decision Guide](/docs/decision-guides/charting) helps an agent work outward from those fields. It covers what a visit includes, how form responses become queryable data, signing requirements, and who owns the templates. Related access-control guidance helps establish who can read and change the resulting records.

Each answer has an implementation consequence. Saving measurements as Observations makes them available for other parts of the application to query. Choosing how responses become Observations affects the form's extraction logic. Defining what completion means determines which workflow step the application should advance.

The agent can research Medplum's implementation options and explain the tradeoffs. Your team supplies the requirements for its own clinical workflow. The planning instructions tell the agent to reuse answers already given and ask about consequential gaps.

## Carry the answers into the next coding task

Suppose the team confirms that completing this form means saving the required measurements, with signing handled separately. It also agrees that the measurements should reference the patient and encounter. A decision record can make those choices available to the implementation task:

```markdown
Status: confirmed
Decision: Require blood pressure and heart rate; make weight optional.
Store the measurements as Observations linked to the patient and encounter.
Completing this form saves the measurements; visit signing is a separate step.

Checks: Verify saved values, units, patient, and encounter.
Omitting weight must not create an empty weight Observation.

Status: open
Question: Can staff complete the form when a required reading cannot be obtained?
Blocks: Finalizing completion rules and their acceptance tests.
```

This is an illustrative record for this workflow. The agent should record recommendations awaiting agreement as proposed and unanswered questions as open, including what they block. The [planning workflow](/ai/planning.md) defines how to save those records alongside your application code and keep them current.

Before implementation, resolve the open completion rule and agree on extraction, resource constraints, and access. The agent can then follow the linked docs to build the form and its checks. For straightforward form mappings, Medplum's [Structured Data Capture extraction](/docs/questionnaires/parsing-questionnaire-responses) is one option; workflows involving scoring or external calls may need a Bot. The appropriate choice follows from the requirements.

Now change the request: make weight required. The saved decision gives the next task a specific starting point. The agent should clarify whether the change applies to existing visits, then update the decision, form, and tests together. Changes to resource constraints may also require profile and migration work.

Engineers can review that change against a shared requirement. A later coding session can read the same decision and its rationale.

## Give agents guidance they can reuse

We've connected several reusable resources to support this workflow:

- **[Decision guides](/docs/decision-guides)** supply workflow questions, tradeoffs, and links to implementation docs across areas such as charting, scheduling, and access control.
- **[Planning instructions](/ai/planning.md)** describe how to research, ask about missing requirements, save decisions, and use them during implementation and review.
- **[Medplum rules](/ai/medplum-rules.md)** direct agents to documented patterns and checks, including FHIR R4 types, resource validation, and API access tests.
- **The repository's [AGENTS.md](https://github.com/medplum/medplum/blob/main/AGENTS.md)** directs supported agents working in the Medplum clone to this guidance. The setup workflow helps you connect the rules and saved decisions to your own application's project instructions.

Confirm that your coding tool reads those references in a fresh session, and reload the relevant docs and decisions after context compaction. The rules make the context available; tests and engineering review check the implementation.

For teams running automated coding workflows, provide the same guidance at a pinned revision and the current project decisions to each planning, implementation, or review job. Engineers retain responsibility for product choices, architecture, and accepting the result. The shared context gives each job a consistent basis for doing its part.

## Try it on one feature

Follow the [AI coding setup guide](/docs/building-with-ai-coding-assistants#plan-your-application), then give your agent a focused request:

```text
Help me plan [feature] on Medplum.
Follow https://www.medplum.com/ai/planning.md, including its Medplum rules.
Start with our existing requirements, code, and decisions.
Ask about consequential gaps and explain the relevant tradeoffs.
Save our decisions and acceptance checks before implementation.
Ask before changing project instruction files.
```

Start with one feature, review the decisions together, and use the saved record to guide its implementation.

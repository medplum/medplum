---
sidebar_label: AI Coding Assistants
title: Building on Medplum with AI Coding Assistants
tags: [ai, agentic-engineering, best-practices, mcp]
keywords: [vibe coding, agentic engineering, llm, agent, mcp, skills, cursor, claude, copilot]
---

# Building on Medplum with AI Coding Assistants

Agentic engineering (a.k.a. "vibe coding") means using an LLM or agent – Cursor, Claude,
Copilot, and others – to build features on Medplum. The biggest lever for quality is
making your AI tools learn from Medplum's open-source code and docs rather than generic
FHIR knowledge from the open internet.

> Building AI _into_ your application at runtime, such as clinical summarization, agents
> acting on patient data, or MCP-driven workflows, is a different topic; see
> [Build with AI on Medplum](/docs/ai). This page is about using AI to _develop_ on
> Medplum.

:::caution[AI gets things wrong; review its output]
Agents are fast and often right, but they hallucinate fields, mix FHIR versions, and
produce plausible-but-wrong code. Treat everything an agent writes as a draft to review,
not a finished answer. Apply extra scrutiny to anything that affects security or data
exposure, especially access policies, ProjectMembership scopes, and PHI handling.
:::

## Our Recommendations

1. Give your AI tools access to Medplum: clone the repo and link it in (preferred), give
   the agent docs and GitHub search, or connect the MCP server.
2. Plan and prompt with Medplum as the source of truth: have the model read the docs and
   code and propose patterns before it writes anything.
3. Keep conversations short and re-anchor on the docs: context decays over long sessions,
   so scope one task per thread and re-check work at checkpoints.
4. Verify and validate the output: check generated code against the type system and tests,
   review sensitive code by hand, and use Medplum's server-side validation where you can.
5. Encode your conventions in a rule file: a `CLAUDE.md`, Cursor rules, or `AGENTS.md`-style
   file keeps the agent pointed at Medplum's docs without being told each time, and the
   conventions survive compaction.

## 1. Give Your AI Tools Access to Medplum

Medplum is open-source with extensive docs on healthcare implementation patterns. When an
LLM indexes on Medplum directly, results are significantly better; it pulls from valid
snippets, real implementations, and trade-off guidance instead of guessing.

### Option 1: Clone and Link the Repo (Preferred)

Agnostic to your LLM and editor:

1. Clone the repo: [https://github.com/medplum/medplum](https://github.com/medplum/medplum)
2. From your repo's top level, symlink your local copy:

   ```bash
   ln -s /absolute/path/to/medplum medplum-link
   ```

3. Prompt away, telling the model it can read `medplum-link/` (includes `packages/`,
   example apps, and `packages/docs`).

### Option 2: Search Docs and GitHub

If you'd rather not clone, give your agent search access; for example, one Claude Skill
(or Cursor equivalent) that searches the [public docs](/docs) via Algolia, and one that
searches the GitHub repo via the GitHub CLI (`gh`).

### Option 3: MCP Server

Medplum offers an MCP server for structured access to docs and data. See
[Direct Data Access](#direct-data-access-advanced) below, where the setup link and
data-access caveats live.

## 2. Plan and Prompt with Medplum as the Source of Truth

Lead with a planning prompt before implementation: have the model read the relevant docs
and code, summarize the recommended pattern and trade-offs, and only then write code.

> Design patterns: I want a task-assignment service for a 50-state practice, where
> patients are seen by practitioners licensed in their resident state and clinical ops
> handles issues that don't need a licensed practitioner. Read the Medplum docs and
> explain the common design patterns I can use.

> Example implementations: I want video conferencing for virtual appointments plus
> patient photo and video uploads at intake. Find example implementations in the Medplum
> codebase I can reuse, and explain how they're deployed.

When possible, have the agent adapt the closest existing implementation rather than
generate from scratch; [Medplum Provider](/docs/provider) is a good starting reference
point for most clinical workflows. You can also capture instructions like these in a rule
file so you don't restate them in every prompt; see
[section 5](#5-encode-your-conventions-in-a-rule-file).

## 3. Keep Conversations Short and Re-Anchor on the Docs

Even when an agent starts with the right Medplum docs and code in context, quality
degrades over a long session. As the conversation grows, the model compacts or drops
earlier context, so the precise FHIR patterns and code references it loaded early get
summarized away, and it drifts back toward generic FHIR knowledge from the open internet.
The result: strong early answers, then subtle regressions later in the same thread.

Practical habits that keep the agent grounded:

- Scope one task per conversation. Finish a feature or fix, then start fresh rather than
  letting one thread sprawl across unrelated work.
- Re-pull the docs at checkpoints, not just at the start. Have the agent re-read the
  relevant docs and code after meaningful steps; for example, after it generates a FHIR
  resource, tell it to check that resource against the docs before moving on. Periodic
  re-grounding catches drift before it compounds.
- Plan, then execute in a clean thread. Use a planning conversation to settle on the
  pattern (section 2), then open a new conversation to implement it with just the files
  that matter in context.
- Watch for drift. If the agent stops citing real Medplum snippets and starts producing
  plausible-but-generic FHIR, that's your signal to reset.

A rule file is the durable fix: because it is re-read on every turn, these conventions and
source-of-truth pointers survive compaction instead of being summarized away. See
[section 5](#5-encode-your-conventions-in-a-rule-file).

## 4. Verify and Validate the Output

An agent's confidence is not a measure of correctness. Build verification into your
workflow so mistakes are caught by tooling and review, not in production.

### Easy Checks (No Data Access Needed)

These run against your own project and the cloned repo, with no server or live data:

- Type-check and compile. The single best check, and one the agent can run itself if it
  has terminal access: build the agent's code against the `@medplum/fhirtypes` types and
  run `tsc`. The types are strict, so a hallucinated field on a _typed_ FHIR resource
  (e.g. `const patient: Patient = { ... }`) is a compile error rather than a runtime
  surprise. The check only bites when the agent actually annotates its resources;
  untyped object literals slip through.
- Run the existing tests, lint, and build. Regressions and bad search params fail loudly.
- Self-review against the docs. Have the agent re-read the relevant doc or example and
  compare its output before you accept it.
- Mind the FHIR version. Medplum uses FHIR R4; LLMs readily mix in R5 fields or deprecated
  APIs from their training data, so this is a common silent error. A project rule file
  (see section 5) is the durable place to pin this.
- Review sensitive output by hand. Access policies, auth scopes, and any code touching PHI
  deserve a detailed human read before shipping. A second pass, where the agent re-checks
  its own work against the docs in a fresh conversation, catches more but does not replace
  human review.

### Going Further (Requires a Server)

Full FHIR validation runs server-side. Submit resources to the FHIR
[`$validate`](/docs/api/fhir/operations/validate-a-resource) operation, validate codes
against a ValueSet with
[`$validate-code`](/docs/api/fhir/operations/valueset-validate-code), or round-trip
resources through a `MedplumClient`; these check against the real FHIR and profile
definitions, catching structural and terminology errors the type system can't (hallucinated
LOINC, SNOMED, and ICD codes are a common failure mode). They need either a local dev
server (synthetic data, no BAA required) or a token against a live server; see
[Direct Data Access](#direct-data-access-advanced) for the caveats.

## 5. Encode Your Conventions in a Rule File

A rule or instructions file — `CLAUDE.md` for Claude Code, `.cursorrules` for Cursor, or an
`AGENTS.md`-style file — is re-read on every turn. That does two things: it saves you from
restating "read the Medplum docs" in every prompt, and it keeps these conventions alive
through compaction in long sessions. The most valuable part is the documentation block;
pointing the agent at Medplum's docs as the source of truth is what makes it reach for them
on its own.

The example below is the rule file we offer as a starting point. Keep the one
documentation-access bullet that matches how you set things up in
[section 1](#1-give-your-ai-tools-access-to-medplum), drop the conventions that don't apply
to you, and add your own.

```markdown
# Agent Rules for Medplum

## Documentation is the source of truth
<!-- Keep the ONE bullet matching your setup; delete the other two and this comment. -->

- Medplum docs are at `medplum-link/packages/docs/docs/` — `[slug]` → that path + `.md`. Read with the file tools.
- Resolve `[slug]`s with your own Medplum docs skill: invoke `<YOUR_SKILL_NAME>` with the bracketed slug/topic as the query.
- Resolve `[slug]`s using your Medplum MCP server.

Read the relevant doc once before building in an area — prefer real Medplum patterns over generic
FHIR. Don't re-read docs you've already read this session, EXCEPT: if the conversation has been
compacted/summarized (or you can no longer see the doc's actual text), re-read the relevant doc
before writing code — the rules below are reminders, not a substitute for the doc.

## Core

FHIR R4 only; type with `@medplum/fhirtypes`; reuse `@medplum/core` helpers; don't invent fields,
search params, or operations.

## Common Mistakes

- Messaging: thread header carries no payload; `recipient` = ALL participants incl. the sender/creator.  [communications/messaging-data-model]
- Scheduling (alpha): availability is implicit — create `Slot`s only for booked/blocked time, never for open availability.  [scheduling/defining-availability]
- Bundles: entries that cross-reference need `type: transaction` + `urn:uuid` fullUrls (or `reorderBundle()`), not batch.  [fhir-datastore/fhir-batch-requests]
- Idempotent writes: conditional create/update keyed on `identifier` (`createResourceIfNoneExist`), never search-then-create.  [fhir-datastore/working-with-fhir]
- Files: `createMedia`/`createBinary`/`createAttachment` → `Binary/{id}` url + securityContext; never base64 in `Attachment.data`.  [fhir-datastore/binary-data]
- Access: patient-compartment access comes from a resource's OWN compartment references (e.g. `subject`); it does NOT propagate through links like `Communication.partOf`. Enforce via `AccessPolicy` + `ProjectMembership` (`%patient`/`%org` variables), never app-layer filtering.  [access/access-policies]
- Licensing: one `PractitionerRole` per state; Medplum does not enforce licensure — your app code must.  [scheduling/state-by-state-licensure]
- Subscriptions: scope `criteria` tightly; create/update-only firing and `%previous`/`%current` transition criteria exist as Medplum extensions.  [subscriptions/subscription-extensions]
- Form extraction: SDC `templateExtract` or a Bot — one strategy per form.  [questionnaires/parsing-questionnaire-responses]

Before finishing: re-check your code against the list above; verify with `tsc` and tests.
```

## Direct Data Access (Advanced)

Giving your AI tool direct access to your Medplum data, via an API access token or the MCP
server (setup: [MCP](/docs/ai/mcp)), speeds things up but carries real caveats:

:::caution

- If it can reach live PII/PHI: you _must_ have a BAA with your LLM vendor.
- If you don't have a BAA: apply an access policy so the token reaches only non-PII/PHI
  data.

:::

In FHIR, only request and record resources generally contain PII/PHI; templating resources
define their _shape_ but hold no sensitive data
([workflow patterns](/blog/fhir-workflow-patterns-to-simplify-your-life)). Scope the token
via an [access policy](/docs/access/access-policies), typically on its
[ProjectMembership](/docs/api/fhir/medplum/projectmembership), and, per the caution at
the top of this page, review that policy by hand before you trust it.

## See Also

- [Build with AI on Medplum](/docs/ai) – building AI into your application at runtime
- [MCP](/docs/ai/mcp) – connect Medplum's MCP server
- [Access Policies](/docs/access/access-policies) – scope what a token can reach
- [Validate a Resource](/docs/api/fhir/operations/validate-a-resource) FHIR operation
- [Medplum Provider](/docs/provider) – reference implementation for clinical workflows

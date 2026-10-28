---
sidebar_label: AI Coding Agents
title: Building on Medplum with AI Coding Agents
tags: [ai, agentic-engineering, best-practices, mcp]
keywords: [vibe coding, agentic engineering, llm, agent, mcp, skills, cursor, claude, copilot]
---

import MedplumRules from '@site/src/components/MedplumRules';

# Building on Medplum with AI Coding Agents

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

## Start Here: Plan Your Application {/* #plan-your-application */}

Cloning Medplum gives your agent reference material. Use this first prompt to connect
that material to your project and start a planning conversation:

1. Open your application's folder in your coding agent. If you are starting from scratch,
   use an empty application folder or the [Hello World starter](/docs/tutorials/medplum-hello-world).
   Your application's instructions and decisions belong there; the Medplum clone is a reference.
2. Give the agent access to your Medplum clone. The prompt assumes it is linked as
   `medplum-link`, as described in [section 1](#1-give-your-ai-tools-access-to-medplum).
   Otherwise, replace `medplum-link` with the clone's actual path.
3. Copy this prompt and replace the application description:

```text
Help me plan [describe your application or feature] on Medplum.

Read and follow medplum-link/packages/docs/static/ai/planning.md
(or https://www.medplum.com/ai/planning.md), including its Medplum rules.
Ask before creating or changing this app's project instruction files.
Start with my existing requirements, code, and decisions, then select the relevant
decision guides. Ask about consequential missing requirements; do not invent answers.
Save and summarize the decisions in my app's repo before implementation.
```

The agent should read the rules and, once it knows your application's folder, check whether
your project instructions already load them. If needed, it should offer to connect the rules
to your `AGENTS.md`, `CLAUDE.md`, or equivalent before planning or implementation, showing
the exact proposed change and asking permission. You can decline and continue the work.
See the [setup details](#5-encode-your-conventions-in-a-rule-file) for an example.

Without a clone, use the [planning instructions](pathname:///ai/planning.md) through an agent
with web access. For one workflow, use the **Plan with this guide** prompt on its
[decision guide](/docs/decision-guides); it uses the same setup and planning procedure.

## Our Recommendations

1. Give your AI tools access to Medplum: clone the repo and link it in (preferred), give
   the agent docs and GitHub search, or connect the MCP server.
2. Plan with Medplum's decision guides: have the agent interview you about your requirements,
   explain the tradeoffs, and save the decisions in your application's repo before implementation.
3. Keep conversations short and re-anchor on the docs: context decays over long sessions,
   so scope one task per thread and re-check work at checkpoints.
4. Verify and validate the output: check generated code against the type system and tests,
   review sensitive code by hand, and use Medplum's server-side validation where you can.
5. Encode your conventions in a rule file: a `CLAUDE.md`, Cursor rules, or `AGENTS.md`-style
   file makes Medplum conventions and your saved decisions available to later tasks.

## 1. Give Your AI Tools Access to Medplum

Medplum is open-source with extensive docs on healthcare implementation patterns. When an
LLM indexes on Medplum directly, results are significantly better; it pulls from valid
snippets, real implementations, and trade-off guidance instead of guessing.

### Option 1: Clone and Link the Repo (Preferred)

Agnostic to your LLM and editor:

1. Clone the repo: [https://github.com/medplum/medplum](https://github.com/medplum/medplum)
2. From your repo's top level, symlink your local copy (macOS or Linux):

   ```bash
   ln -s /absolute/path/to/medplum medplum-link
   ```

   Alternatively, give your agent the clone's actual path and adjust the prompts on this page.
   Keep machine-specific symlinks out of version control; provide the checkout separately in
   new development or automated environments.

3. Tell the model it can read `medplum-link/`. The clone includes the technical docs,
   reusable components, and example apps. The planning workflow uses:
   - `medplum-link/packages/docs/docs/decision-guides/`: questions and design tradeoffs.
   - `medplum-link/packages/docs/static/ai/planning.md`: instructions for planning and implementation.
   - `medplum-link/packages/docs/static/ai/medplum-rules.md`: reusable rules, shown in
     [section 5](#5-encode-your-conventions-in-a-rule-file).

You can read these files without installing or running the Medplum monorepo.
Confirm that your agent can read them before starting.

If you open the Medplum clone directly, its root `AGENTS.md` directs supported agents to
this guide and the rules, and asks them to offer setup in your application's folder.
When working in a separate application folder, use the [starting prompt](#plan-your-application)
or [configure its project instructions](#5-encode-your-conventions-in-a-rule-file);
access to a reference clone alone does not ensure its instructions are loaded.

### Option 2: Search Docs and GitHub

If you'd rather not clone, give your agent search access; for example, one Claude Skill
(or Cursor equivalent) that searches the [public docs](/docs) via Algolia, and one that
searches the GitHub repo via the GitHub CLI (`gh`).

### Option 3: MCP Server

Medplum offers an MCP server for structured access to docs and data. See
[Direct Data Access](#direct-data-access-advanced) below, where the setup link and
data-access caveats live.

## 2. Plan with Medplum's Decision Guides {/* #2-plan-and-prompt-with-medplum-as-the-source-of-truth */}

Use the [Decision Guides](/docs/decision-guides) to work through application design before
writing features. Each guide connects discovery questions to Medplum patterns and technical
docs. Your agent should ask you about missing requirements, explain the tradeoffs, and
save the answers for later coding tasks.

Use the [starting prompt](#plan-your-application) to begin. The examples below show what
the agent saves and how to use it in later development.

### Keep the Answers in Your Repo

The agent saves a short application plan and decisions organized by guide section in
your repo, reusing existing planning files. For a focused feature, a single decision record
may be enough. The [planning instructions](pathname:///ai/planning.md) define the file layout
and how to distinguish agreed choices, recommendations awaiting a decision, and unanswered
questions. Keeping these alongside code lets later tasks use them without relying on chat history.

<details>
<summary>Example: Saved Charting Decisions</summary>

After a charting discussion, part of `docs/decisions/charting.md` might look like this.
These are illustrative answers, not defaults for every application:

```markdown
# Charting decisions

Source: https://www.medplum.com/docs/decision-guides/charting
Local source: medplum-link/packages/docs/docs/decision-guides/charting.md
Source revision: [commit from git -C medplum-link rev-parse HEAD]
Consulted: [date]

## 2.1 What visit types do you provide, and what does each entail?

Status: confirmed
Decision: The first release supports an initial visit and a follow-up visit.
Reason: Clinical operations confirmed these are the launch workflows.
Implementation: Define a Visit Template for each visit type.

## 2.3 How will form responses be parsed into queryable data?

Status: proposed
Proposal: Use SDC extraction for the initial visit's structured form.
Reason: The described mappings appear straightforward; scoring or external lookups would change this choice.
Pending: Confirm the form's processing requirements with the application owner before implementing extraction.

## 2.4 What are the signing requirements?

Status: open
Question: Does this practice require a co-signature for any visit type?
Blocks: Finalizing the signing workflow and its acceptance tests.

## 2.5 Who owns and edits Visit Templates?

Status: confirmed
Decision: Clinical operations specifies changes; engineering implements them.
Reason: Clinical operations expects infrequent template changes in the first release.
Implementation: Keep templates under code review; a custom template editor is out of scope.
```

A later request to add a template editor changes the saved ownership decision. The agent
should identify any remaining questions, such as who can publish template changes, and
update the record alongside the implementation.

</details>

When choosing implementations, have the agent inspect Medplum's reusable components and
examples. [Medplum Provider](/docs/provider) is a useful reference for clinical workflows;
you can also build a custom app with the [React components](/docs/api/react).

### Implement from the Saved Decisions

For the next coding task, give your agent a specific feature and the saved context.
For example, after agreeing on your charting plan:

```text
Implement [the next charting feature]. Read my project instructions, application
plan if present, and docs/decisions/charting.md. Follow the implementation steps in
medplum-link/packages/docs/static/ai/planning.md (or https://www.medplum.com/ai/planning.md)
and the relevant technical docs. Ask about missing requirements; do not invent answers.
Check the result against the saved decisions and agreed acceptance criteria.
```

Add pointers to these files in the [project rules](#5-encode-your-conventions-in-a-rule-file)
your tool loads so future tasks can find them without relying on chat history.

For an organization's automated coding system, provide the same Markdown instructions,
relevant guides and technical docs at a pinned revision, and saved decisions to each job.
Route blocking questions back to the application owner. This workflow does not depend on
a particular editor or a single ongoing chat.

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
  pattern (section 2), then open a new conversation with the application plan, relevant
  decision records, and technical docs. Ask the agent to implement against those decisions
  and check the result against the acceptance criteria.
- Watch for drift. If the agent stops citing real Medplum snippets and starts producing
  plausible-but-generic FHIR, that's your signal to reset.

Keep a pointer to the saved decisions in your project's rule file, and make sure new tasks
load the relevant records. Instruction-loading behavior varies by tool; explicitly reload
the relevant docs and decisions after compaction. See
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

On first use, the agent should read the Medplum rules for the current task. Once your
application's folder is known, it should check whether the project instructions your coding
tool loads already include or reference those rules. If so, verify that the rules can be read
instead of adding another copy. Otherwise, offer to connect them before planning or
implementation. This setup also applies when you are starting development without a planning session.

The agent must show the proposed filename and exact addition, then ask permission before
creating or changing project instructions. Approval already given for the same change is
sufficient. Preserve existing instructions, verify the agreed changes, and report what was
configured. If you decline, cannot respond, or the files cannot be edited, continue the
requested work without changing those instructions or claiming setup is complete. Do not
repeat a declined offer in the same session.

With a local clone, the default is a short reference to its rules file. For manual setup,
merge a section like this into your application's `AGENTS.md`, `CLAUDE.md`, or equivalent
rule file, adjusting the clone path:

```markdown
## Medplum

Before planning or implementing Medplum features, read and follow
`medplum-link/packages/docs/static/ai/medplum-rules.md`.
If the clone is unavailable, use https://www.medplum.com/ai/medplum-rules.md.
```

This explicitly tells the agent to open the file; a standalone `medplum-rules.md` is not
automatically discovered. If you prefer a self-contained application repo, copy the rules
there and reference that copy instead. Record its source and revision or retrieval date so
you can refresh it when updating Medplum.

After plans and decisions are saved, the agent can propose adding their actual paths to
your project instructions, using the same review and permission process. If you declined
setup in this session, it should include those paths in its handoff without repeating the
offer. Reference only files that exist; keep the full plan and guides in their source files.

Check your tool's instruction-loading behavior: see [Codex's AGENTS.md guidance](https://learn.chatgpt.com/docs/agent-configuration/agents-md)
or [Claude Code's project instructions](https://code.claude.com/docs/en/memory). After setup,
start a fresh session and ask the agent to read the project's Medplum rules and identify
the saved planning files, if present. Check the paths and its file reads. If references are
not followed reliably, include the rules below directly in the loaded project instructions.

The example below is rendered directly from the reusable [medplum-rules.md](pathname:///ai/medplum-rules.md)
file, also available at `medplum-link/packages/docs/static/ai/medplum-rules.md` in the clone.
For agents using web access, the public URL is `https://www.medplum.com/ai/medplum-rules.md`.
The rules prefer the local clone and fall back to the public docs. Keep the full guides and
planning procedure in their source files so the agent can read them when needed.

<MedplumRules />

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

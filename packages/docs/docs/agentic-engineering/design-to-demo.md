---
sidebar_label: Design Prototypes and Demos
title: From Design to Demo with AI Agents
tags: [ai, agentic-engineering, react, best-practices]
keywords: [agentic engineering, prototype, demo, design review, storybook, mock data, synthetic patients]
---

# From Design to Demo with AI Agents

Agentic engineering is not only for shipping features. The same setup that lets an agent build
on Medplum lets a designer or product manager get a working screen to click through before the
backend exists. This page is for the people who want that screen and for the coding agent that
builds it. The [AI Coding Agents guide](/docs/building-with-ai-coding-assistants) covers giving
the agent access to Medplum's docs and code. This page applies that setup to one job: turning a
design into an interactive prototype on synthetic data, then reusing that prototype as a demo, a
Storybook story, and a test fixture.

You do not need to write FHIR by hand. You describe the scenarios in plain language, the agent
writes the data and the screen, and you review what comes back in the browser.

:::caution[Use synthetic data only]
Teams check fixtures into repositories, paste them into screenshots, and show them on calls, so
they travel further than most code. Keep real patient, staff, and customer data out of them. The
helpers on this page produce invented records, and every example in Medplum's own fixtures uses
invented people.
:::

## What You Get

- **A screen that works without a server.** `@medplum/mock` runs a small in-memory Medplum in
  the browser, and Medplum's React components, such as `PatientSummary`, render against it the
  same way they do against a real project.
- **Scenarios you can switch between.** An empty chart, a busy chart, a very long name, or two
  patients side by side. Each is a named set of data you can load on demand.
- **One set of data, four uses.** The same scenario file powers the design review, the sales
  demo, the Storybook story, and the automated test, so engineering does not rebuild it later.
- **Required fields filled for you.** If your team has agreed on a
  [FHIR profile](/docs/fhir-datastore/profiles), the generator fills whatever the profile
  requires, and you supply only the values that make the scenario meaningful.

## The Pieces, in Plain Terms

| Piece                               | What it is                                                                                                                                 | Who touches it              |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------- |
| Scenario (a Mock State)             | A list of synthetic records plus named entry points, called handles, such as `patient` or `sick` and `well`. It is plain JSON.             | Agent writes, you read      |
| `createMockState`                   | Packages records and handles into a scenario, and refuses duplicates or handles that point at nothing.                                     | Agent                       |
| `createMockClient`                  | Loads one scenario into a fresh, isolated in-memory client with none of Medplum's default sample patients.                                 | Agent                       |
| `generateMockResources`             | Creates a batch of records of one type and fills the fields a profile requires. The same input gives the same output every run.            | Agent                       |
| Profile                             | Your team's agreed shape for a record, as a resolved StructureDefinition. It is optional, and without one base FHIR applies.               | Engineering provides        |
| `PatientSummaryStates`              | Four ready-made scenarios shipped with `@medplum/mock`: `busyPatient`, `newPatient`, `twoPatients`, and `sixPatients`.                     | Anyone, as a starting point |
| Storybook decorator `withMockState` | In the Medplum repository, a story with `parameters.mockState` gets its own client and a frozen clock. Applications copy the same pattern. | Engineering                 |

The full reference for these helpers, including what the generator can and cannot fill, is
[Build a screen with mock data](/docs/react/mock-screens).

## Before You Start

1. Set up your agent as described in the
   [AI Coding Agents guide](/docs/building-with-ai-coding-assistants#1-give-your-ai-tools-access-to-medplum).
   The clone-and-link option works best here because the agent can read `@medplum/mock` and the
   React components directly instead of guessing at their behavior.
2. Have somewhere to build: your application repository, or a throwaway Vite project with
   `@medplum/react`, `@medplum/react-hooks`, `@medplum/mock`, and `@mantine/core` installed.
3. Know your scenarios, and write them down in a sentence each before you prompt. "A patient
   with nothing on file yet" and "a patient with three active medications and a drug allergy"
   are enough to start.
4. If engineering has a profile, get the resolved snapshot JSON file. If not, skip it. The agent
   will author complete records directly.

## Walkthrough: A Patient Summary

### Step 1: Scaffold the Screen

Give the agent the companion instructions and your scenarios. The instructions file tells the
agent how to lay out fixtures, which helpers to use, and where the values must come from a human.

```text
Read and follow medplum-link/packages/docs/static/ai/prototype.md
(or https://www.medplum.com/ai/prototype.md), including its Medplum rules.

Build a patient-summary prototype for design review and demos using Medplum's
PatientSummary component and @medplum/mock. No backend.

Scenarios:
- newPatient: a patient registered this morning with nothing else on file
- busyPatient: three active medications, one drug allergy, two chronic conditions,
  two recent lab results, one upcoming appointment
- longName: a patient whose name wraps onto two lines in a 350px column
- twoPatients: two patients open side by side, one sick and one well

Put each scenario in src/fixtures/patient-summary.ts and a patient switcher in the
app shell. Supply every reference and clinical value yourself. Where you are not
sure of a clinical code, use a plain text description and list it for me to
confirm.

Done when type-check and tests pass, every scenario opens from the switcher,
and your report gives me the start command and the list of codes to confirm.
```

### Step 2: Review in the Browser

Start the app the way the agent tells you to and click through every scenario. Look for what a
connected backend would have hidden from you: empty states, text overflow, what a section looks
like with one entry versus ten, and whether the switcher makes it obvious which patient is on
screen.

Give feedback the same way you would to a teammate:

```text
busyPatient: the medications list should show the newest first.
longName: the name is truncated with an ellipsis. I want it to wrap instead.
Add a scenario "deceased" where the patient has a date of death and every
section is read-only.
```

### Step 3: Adopt the Team's Profile

When engineering has agreed on required fields, hand the profile to the agent so the prototype
and the product share one definition of a complete record.

```text
Here is our resolved MockPatient profile: src/fixtures/StructureDefinition-mock-patient.json.
Regenerate the sixPatients scenario with generateMockResources using this profile.
Keep every authored value I already approved, and keep the profile as it is.

Done when sixPatients regenerates from the profile with my approved values
intact, or when you have reported the field the generator rejected and why.
```

The generator fills required names, dates, and bound codes from the profile. It never picks
references, clinical codes, or measurements for you, because those belong in the fixture where
a human can see and approve them.

### Step 4: Turn It into a Demo

A demo sequences the scenarios you already have, so ask the agent for a demo mode rather than a
different app.

```text
Add a demo mode behind ?demo=1. In demo mode:
- start on newPatient
- a "Next" button walks from newPatient to busyPatient to twoPatients
- each step shows a one-line caption describing what to notice
- freeze the clock at 2024-03-05T09:00:00Z so relative dates read the same in every run
Keep the fixtures unchanged. The demo only sequences them.

Done when Next walks all three steps in order and two runs show identical dates.
```

### Step 5: Hand Off to Engineering

The fixtures are already the handoff. Ask the agent to finish the job:

```text
Add a Storybook story per scenario using parameters.mockState, with
docs.story.inline=false so each story gets its own clock. Add a test per
scenario that renders PatientSummary and asserts the records I approved
are visible. Write docs/decisions/patient-summary.md listing the scenarios,
the profile used, and the open questions from our review.

Done when every scenario has a story and a passing test, and the decision
record exists.
```

## Prompt Library

Copy one, edit it, and send it. Each prompt assumes the agent already follows the companion
instructions.

**Start from a screenshot or design file**

```text
Build the screen in design/patient-summary.png.
Use a Medplum component wherever one fits (PatientSummary, ResourceTable, Timeline).
Where none fits, build a small Mantine component and name it in your report.
Data: PatientSummaryStates.busyPatient from @medplum/mock, until I supply our own.

Done when the screen renders busyPatient with no console errors and your report
lists every component you wrote yourself.
```

**Start from Medplum's bundled scenarios**

```text
Render PatientSummary against each of PatientSummaryStates.busyPatient,
newPatient, twoPatients, and sixPatients, one tab per scenario, using the
bundled data as it is.

Done when I can switch between all four tabs and each shows every handle of
its scenario.
```

**Add one scenario**

```text
Add a scenario "pediatric" to src/fixtures/patient-summary.ts: a four-year-old
with an active asthma diagnosis, one rescue inhaler, and growth measurements
from the last three visits. Leave the existing scenarios unchanged.
Show me the fixture and wait for my approval before wiring it into the switcher.

Done when I have approved the fixture and the switcher lists pediatric.
```

**Add varied names and dates**

```text
Supply names and birth dates for the sixPatients scenario from @faker-js/faker
inside the values callback. Pin the version, seed a fresh instance per call,
and fix the date bounds. Keep the long-name, deceased, and empty-chart
scenarios hand-written.

Done when two consecutive test runs produce identical fixtures and the
hand-written scenarios are unchanged.
```

**Explain the data to a non-engineer**

```text
For each scenario in src/fixtures/patient-summary.ts, write two plain-English
sentences: who the patient is, and what the screen should show. Put them in a
comment above the scenario and in docs/fixtures.md.

Done when every exported scenario has both.
```

**Check it before a demo**

```text
Run the Demo Checklist from
https://www.medplum.com/docs/agentic-engineering/design-to-demo against this app.
Report each item as pass or fail with the evidence. Leave fixes for me to approve.

Done when every item has a verdict.
```

## For Agents: What to Save and Where

An agent following the companion instructions keeps three kinds of files, and humans review all
of them.

- **Fixtures** in the application's fixture directory, one file per screen. Each exports named
  scenarios built with `createMockState`, with a comment per scenario saying what it is for.
  Values live here, including anything from Faker. The generator itself takes no per-project
  configuration.
- **A scenario note** at `docs/fixtures.md` or beside the fixtures: scenario names, the profile
  in use and its source, and which scenarios are hand-written versus generated.
- **Decisions and open questions** in the repository's existing decision records, following the
  [planning instructions](pathname:///ai/planning.md). A design review produces decisions about
  data shape just as a planning interview does.

Agents take the profile as given, use plain text where a code is uncertain, and invent every
person in a fixture. When a scenario needs a profile feature the generator does not support,
they author the records directly and say so in the scenario note.

## Demo Checklist

Run through this before showing the prototype outside the team.

- Every scenario loads with no console errors and no loading skeleton left on screen.
- Dates read correctly, either because the clock is frozen or because every date is relative to
  today.
- Names, identifiers, and organizations are invented, and none matches a real person or customer.
- Switching patients changes every section on screen, with nothing left over from the previous
  patient.
- The empty scenario looks intentional rather than broken.
- The long-name and many-items scenarios fit the layout you will present on.
- The person presenting can start it from a clean checkout with one command.

## Limits

The prototype runs on `MockClient`, which implements a subset of the Medplum API. Search works
for the parameters the mock ships with, and unknown parameters return no matches. Access policies
are not enforced, so a prototype proves what a screen looks like, not who may see it. The
generator fills required structure and nothing clinically meaningful, and it supports a
[subset of profile features](/docs/react/mock-screens#supported-profile-features). Before any
of this reaches production, validate resources and queries against a real project and review
access control using the
[verification tiers in the AI Coding Agents guide](/docs/building-with-ai-coding-assistants#4-verify-and-validate-the-output).

## See Also

- [Build a screen with mock data](/docs/react/mock-screens): the helper reference.
- [Building on Medplum with AI Coding Agents](/docs/building-with-ai-coding-assistants): setup, planning, verification, and rule files.
- [Profiles](/docs/fhir-datastore/profiles): writing and resolving the profile your prototype shares with the product.
- [React components](/docs/react): what you can put on the screen.
- [Companion instructions for agents](pathname:///ai/prototype.md).

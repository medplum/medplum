# Agent Rules for Medplum

## Documentation is the source of truth

- Prefer the local Medplum docs at `medplum-link/packages/docs/docs/`. Each `[slug]` below resolves to a `.md`, `.mdx`, or `index` file at that path. Adjust the clone path to your environment.
- If the clone is unavailable, resolve `[slug]` at `https://www.medplum.com/docs/[slug]` using available web or documentation tools. Do not assume a custom skill or MCP server is configured. Say when a required source is inaccessible.

Read the relevant doc once before building in an area – prefer real Medplum patterns over generic
FHIR. Don't re-read docs you've already read this session, EXCEPT: if the conversation has been
compacted/summarized (or you can no longer see the doc's actual text), re-read the relevant doc
before writing code – the rules below are reminders, not a substitute for the doc.

## Planning and saved decisions

For planning and implementation, follow `medplum-link/packages/docs/static/ai/planning.md`
(or https://www.medplum.com/ai/planning.md with web access).
Before coding, read the application's saved plan and relevant decision records alongside the technical docs.
Keep these records current when requirements change; use the project's existing planning conventions.

## Core

FHIR R4 only; type with `@medplum/fhirtypes`; reuse `@medplum/core` helpers; don't invent fields,
search params, or operations.

## Common Mistakes

- Messaging: thread header carries no payload; `recipient` = ALL participants incl. the sender/creator. [communications/messaging-data-model]
- Scheduling: availability is implicit – create `Slot`s only for booked/blocked time, never for open availability. [scheduling/defining-availability]
- Bundles: entries that cross-reference need `type: transaction` + `urn:uuid` fullUrls (or `reorderBundle()`), not batch. [fhir-datastore/fhir-batch-requests]
- Idempotent writes: conditional create/update keyed on `identifier` (`createResourceIfNoneExist`), never search-then-create. [fhir-datastore/working-with-fhir]
- Files: `createMedia`/`createBinary`/`createAttachment` → `Binary/{id}` url + securityContext; never base64 in `Attachment.data`. [fhir-datastore/binary-data]
- Access: patient-compartment access comes from a resource's OWN compartment references (e.g. `subject`); it does NOT propagate through links like `Communication.partOf`. Enforce via `AccessPolicy` + `ProjectMembership` (`%patient`/`%org` variables), never app-layer filtering. [access/access-policies]
- Licensing: model a practitioner's role per `HealthcareService` or service line, with licensed jurisdictions in `PractitionerRole.location` (multiple states may share one role). One role per state is not a scheduling requirement. Scheduling operations do not enforce licensure; validate eligibility in the application's controlled booking path. Enforce data access with `AccessPolicy`. [scheduling/state-by-state-licensure]
- Subscriptions: scope `criteria` tightly; create/update-only firing and `%previous`/`%current` transition criteria exist as Medplum extensions. [subscriptions/subscription-extensions]
- Form extraction: SDC `templateExtract` or a Bot – one strategy per form. [questionnaires/parsing-questionnaire-responses]
- Codes: agents routinely hallucinate SNOMED/LOINC/ICD-10 codes; don't invent them or pull them from the internet (unreliable). When unsure, use a clearly-marked placeholder and flag it for human verification rather than shipping a made-up code. [terminology/common-terminologies]

Before finishing: re-check your code against the list above; verify with `tsc` and tests.

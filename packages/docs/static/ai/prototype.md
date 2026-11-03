# Build a design prototype or demo on synthetic Medplum data

Use these instructions when asked for a prototype, a design-review screen, a demo, or Storybook
stories that must run without a Medplum server. They cover the data and the screen. They do not
cover production data access, authentication, or access policies.

## 0. Read the rules and the reference

- Read and apply `medplum-link/packages/docs/static/ai/medplum-rules.md` (or https://www.medplum.com/ai/medplum-rules.md). Adjust paths to the actual clone location. If a source is inaccessible, say so.
- Read `medplum-link/packages/docs/docs/react/mock-screens.md` (or https://www.medplum.com/docs/react/mock-screens) before writing any fixture. It defines what `generateMockResources` fills and what it refuses.
- Read `medplum-link/packages/mock/src/mocks/states/patient-summary.ts` as the reference fixture. Match its layout: helpers at the top, one exported scenario per `createMockState` call, invented people.
- Check installed versions of `@medplum/mock`, `@medplum/react`, and `@medplum/core` in the application before using a helper. Say so if a helper is missing from the installed version rather than reimplementing it.

## 1. Understand the request

- Collect the scenarios as one sentence each. Confirm them back before writing code. A scenario names a person's situation, not a list of FHIR resources.
- Ask which screen or components are in scope and what viewport the review will use.
- Ask whether a profile exists. If a resolved StructureDefinition snapshot is supplied, use it. If only a differential or FHIR Shorthand exists, say the generator needs a resolved snapshot and offer to proceed with authored records meanwhile. Treat the profile as fixed input: when generation fails against it, report the field and the reason.
- Default to Medplum's bundled `PatientSummaryStates` when the user has no scenarios yet.

Done when the user has confirmed the scenario list, the components in scope, and the profile status.

## 2. Write the data

- Put fixtures in the application's existing fixture directory, or `src/fixtures/<screen>.ts` if none exists. One file per screen. Export one scenario per `createMockState(resources, handles)` call. Handles are the named entry points the screen opens, such as `patient`, or `sick` and `well`.
- Invent every person, organization, identifier, and address. Real records, transcripts, tickets, screenshots, and the names of real customers or staff are off limits as sources.
- Supply every reference explicitly with `createReference`. Generation does not create or select related resources.
- Supply clinical values deliberately. Use plain `text` on `CodeableConcept` when unsure of a code, and list every coded value you did choose for human confirmation. Codes come from the user or a terminology service the user names, never from memory or a web search.
- Use `generateMockResources(type, count, { profile, values, idPrefix })` for the records a profile shapes. Put scenario values in `values`, as an object or an index callback. Use a distinct `idPrefix` per batch of the same type. Keep hand-written the cases that must exist exactly, such as a specific long name or an empty chart.
- If Faker is requested, add it to the application, not to a shared package. Pin the version, seed a fresh instance per call, and fix date bounds. Keep it inside `values`.
- Keep a comment above each scenario stating what it shows and which review question it answers.

Done when every scenario from step 1 exports from a fixture file, every reference resolves inside its scenario, and the coded values are listed for confirmation.

## 3. Build the screen

- Create the client once at startup with `await createMockClient(state)` and provide it through `MedplumProvider`. Each client is isolated; create a new one when switching scenarios rather than mutating a shared one.
- Prefer Medplum React components (`PatientSummary`, `ResourceTable`, `Timeline`, and others under `@medplum/react`) over new ones. When none fits, build a small Mantine component and say so in the handoff.
- Open screens through handles, for example `patient={{ reference: state.handles.patient }}`, so the same screen works with every scenario.
- Keep fixtures separate from components. A scenario file imports nothing from the UI.
- For a demo mode, sequence existing scenarios. Freeze the clock if dates matter.

Done when each scenario opens through its handles from one command on a clean checkout.

## 4. Verify

- Type-check and run the application's tests. Add one rendering test per scenario asserting the approved values are visible and no loading skeleton remains.
- Run `validateResource` from `@medplum/core` over every fixture resource in a test. Fix structural errors; report anything the profile demands that the generator cannot produce.
- Open every scenario in the browser, or in Storybook, and check: no console errors, correct dates, every section updates on switch, empty state looks intentional, long text fits the review viewport.
- State plainly what the prototype does not prove: access control, search beyond the mock's bundled parameters, terminology membership, full profile conformance.

Done when type-check, tests, and the browser pass over every scenario, and the gaps are written down.

## 5. Save and hand off

- Write or update `docs/fixtures.md` beside the fixtures: scenario names and purpose, profile source and revision, which scenarios are generated and which hand-written, and the coded values awaiting confirmation.
- Record data-shape decisions and open questions in the repository's decision records, following `medplum-link/packages/docs/static/ai/planning.md` (or https://www.medplum.com/ai/planning.md). Do not duplicate the fixtures there.
- If Storybook exists, add one story per scenario. In the Medplum repository use `parameters.mockState` with the shared decorator and set `docs.story.inline=false` on each such story. In an application, add a small decorator that creates a client from `parameters.mockState`, following `medplum-link/packages/react/src/stories/decorators.tsx`.
- Report: how to start the prototype from a clean checkout, the scenarios and their handles, the coded values to confirm, the open questions, and the limits from step 4.

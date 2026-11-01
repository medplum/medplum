---
title: Build a screen with mock data
---

Use `generateMockResources`, `createMockState`, and `createMockClient` from `@medplum/mock`
to preview a screen without a Medplum backend. A Mock State contains the resources the screen uses and named entry points.
You can reuse it in an app, a demo, a test, or Storybook.

## Generate required fields from a profile

The generator fills missing required fields from a base FHIR StructureDefinition or a supplied
profile. Base generation covers only the types bundled with the mock package; other types need
a supplied snapshot or fully authored resources. Base Patient has no required demographic fields,
so this produces only resource types and stable IDs:

```ts
const patients = generateMockResources('Patient', 6);
```

To generate names and birth dates, make those fields required in a profile. For example, this
[FHIR Shorthand profile](/docs/fhir-datastore/profiles) requires a name, a given name within it,
and a birth date:

```fsh
Profile: MockPatient
Parent: Patient
Id: mock-patient
* name 1..*
* name.given 1..*
* birthDate 1..1
```

Generate the profile's resolved snapshot with your profile tooling, then pass its
StructureDefinition to the generator. A differential alone is not supported. The snapshot must
include inherited elements and base cardinalities; a field that repeats in base FHIR remains a
JSON array even if the profile limits it to one entry.

```ts
import { createReference } from '@medplum/core';
import type { StructureDefinition } from '@medplum/fhirtypes';
import { generateMockResources, createMockState, createMockClient } from '@medplum/mock';
import patientProfile from './StructureDefinition-mock-patient.json';

const patients = generateMockResources('Patient', 6, {
  profile: patientProfile as StructureDefinition,
  values: { name: [{ family: 'Demo' }] },
});

const observations = generateMockResources('Observation', 6, {
  values: (index) => ({
    status: 'final',
    subject: createReference(patients[index]),
    code: { text: 'Example measurement' },
    valueInteger: index + 1,
  }),
});

const state = createMockState([...patients, ...observations], { firstPatient: patients[0] });
const medplum = await createMockClient(state);
```

Each patient receives a generated given name and birth date, and keeps the authored family name
`Demo`. No gender or address is added. The observations use explicit patient references and
authored measurements; generation does not create or select related resources.

`values` accepts a typed partial resource or a callback receiving a zero-based index. The generator
copies the inputs, preserves supplied values including zero and false, and fills required children
in supplied objects. Required arrays are padded to their minimum, including when supplied as `[]`.
An absent optional parent stays absent even if its children would be required when present.
`mustSupport` does not make a field required. Omit optional empty arrays and objects.

Required fixed or pattern values come from the profile. Their contents may include children
that are individually optional but necessary to satisfy that constraint. Supplied values must
match a fixed value or include a pattern; conflicts fail with the resource index and field path.
The generator does not merge a pattern into an incompatible authored value. An absent optional
field stays absent even if it has a fixed or pattern constraint.

Requiring `name` alone does not select `given`, `family`, or `text`. Supply a name or require a
child field in the profile. Likewise, supply references explicitly. If a required choice such as
`medication[x]` permits multiple types, supply one variant or narrow the profile to one type.
Multiple or disallowed variants fail with an error. Optional values can still be supplied
in `values`.

The built-in samples and IDs are deterministic. A `values` callback must also return repeatable
values if you need a deterministic fixture. Generated dates use a fixed UTC baseline of May 4, 2020. Use `idPrefix` when combining multiple batches of the same resource type, or supply IDs in
`values`. Loading data into MockClient still generates version metadata and timestamps;
that metadata is not deterministic unless controlled separately.

## Add project-specific examples with an agent

Use `values` to extend your fixtures without changing the generator. An agent can add reusable
functions in your application's fixture directory, selecting values for the scenarios you want
to review. Keep the agreed profile as the source of required fields, and supply optional scenario
fields through `values`. The generator does not choose demographics or clinical scenarios for you.

The built-in values are structural placeholders, such as `Example name.given 1` and the fixed
date `2020-05-04`. You can supply hand-written examples, use a library such as
[Faker](https://fakerjs.dev/guide/usage), or combine both through the same callback. Faker is an
optional dependency of your demo project, not a dependency of `@medplum/mock`.

For example, after adding `@faker-js/faker` to your demo project, this function supplies names and
birth dates for the Patient profile above. The locale, seed, and date range are choices for this
example, not generator defaults:

```ts
import { Faker, en } from '@faker-js/faker';
import type { StructureDefinition } from '@medplum/fhirtypes';
import { generateMockResources } from '@medplum/mock';

export function createDemoPatients(profile: StructureDefinition, count = 6) {
  const faker = new Faker({ locale: [en] });
  faker.seed(42);

  return generateMockResources('Patient', count, {
    profile,
    idPrefix: 'demo-patient',
    values: () => ({
      name: [{ given: [faker.person.firstName()] }],
      birthDate: faker.date
        .between({ from: '1940-01-01T00:00:00.000Z', to: '2010-12-31T00:00:00.000Z' })
        .toISOString()
        .slice(0, 10),
    }),
  });
}
```

A fresh Faker instance and seed restart the sequence for each call. Keep the dependency version
locked and use fixed date bounds or a fixed reference date for repeatable results; a seed alone
does not stabilize date methods relative to today. Faker upgrades can change the generated
values. See [Faker's reproducibility guidance](https://fakerjs.dev/guide/usage#reproducible-results).
Use a distinct `idPrefix` if you adapt this function to combine multiple batches.

Ask the agent to add new scenarios beside existing fixtures, document what each is testing,
and reuse them in stories and tests. Keep important edge cases, such as a specific long name,
explicit rather than hoping random sampling produces them. Supply resource references and
clinical codes deliberately; Faker does not establish clinical consistency or FHIR conformance.
Use Medplum's existing `validateResource` in fixture tests, plus assertions for the relationships
and behavior your screen depends on. Do not weaken a profile to make generation succeed.

## Supported profile features

The helper supports resolved resource snapshots, nested required fields, array cardinalities,
fixed and pattern values, and restricted choice types. Base definitions and datatype schemas
come from the existing Medplum packages. Parsing a profile does not register it globally or add
`meta.profile` to generated resources.

Missing required primitive `code` values use bundled code lists. An explicit profile binding
wins over the base binding. A versioned binding needs that exact local version; an unversioned
binding can use an exact entry or a single available version. Missing or ambiguous lists require
an authored value. Clinical codes and meaningful measurements belong to the author.

Authored contained resources are copied without recursive generation; required constraints on
their children are unsupported. Core SimpleQuantity and MoneyQuantity use their existing local
datatype schemas. Required constraints beneath primitive
fields (such as `birthDate.extension`) are rejected rather than silently omitted.

Required slices, supplied sliced fields, and fields that need dependent datatype or reference
target profiles are not supported. Absent optional fields with those features remain absent.
The parser can reject unsupported slicing discriminators before generation. Forward or external
content references are rejected, and excessive recursion fails with the field path. Supply a
fully authored resource directly to `createMockState` when its profile is outside this subset.
The generator does not fetch profiles or terminology, expand differentials, evaluate FHIRPath
invariants, or guarantee clinical realism.

## Define data explicitly

Write the values that matter to the screen with the existing FHIR TypeScript types. References
are explicit: creating an Observation does not create or select its Patient.

```ts
import { createReference } from '@medplum/core';
import type { WithId } from '@medplum/core';
import type { Observation, Patient } from '@medplum/fhirtypes';
import { createMockState } from '@medplum/mock';

const patient: WithId<Patient> = {
  resourceType: 'Patient',
  id: 'alex',
  name: [{ given: ['Alex'], family: 'Morgan' }],
};

const heartRate: WithId<Observation> = {
  resourceType: 'Observation',
  id: 'heart-rate',
  status: 'final',
  subject: createReference(patient),
  category: [
    {
      coding: [
        {
          system: 'http://terminology.hl7.org/CodeSystem/observation-category',
          code: 'vital-signs',
        },
      ],
    },
  ],
  code: {
    coding: [{ system: 'http://loinc.org', code: '8867-4', display: 'Heart rate' }],
  },
  valueQuantity: { value: 72, unit: '/min', code: '/min', system: 'http://unitsofmeasure.org' },
};

export const state = createMockState([patient, heartRate], { patient });
```

`createMockState` copies the data and rejects duplicate resource identities or handles that
point outside the state. It does not infer links or validate clinical consistency. To show an
empty clinical record, include only the Patient. For two patients, supply each resource's
patient reference explicitly.

## Render the screen

Create the client once during app startup, before rendering. Each call creates an isolated
client without the default mock patients. Edits in one client do not change the state or another
client loaded from it.

```tsx
import { createRoot } from 'react-dom/client';
import { MantineProvider } from '@mantine/core';
import '@mantine/core/styles.css';
import '@medplum/react/styles.css';
import { createMockClient } from '@medplum/mock';
import { PatientSummary } from '@medplum/react';
import { MedplumProvider } from '@medplum/react-hooks';
import { state } from './screen-data';

const medplum = await createMockClient(state);

createRoot(document.getElementById('root')!).render(
  <MantineProvider>
    <MedplumProvider medplum={medplum}>
      <PatientSummary patient={{ reference: state.handles.patient }} />
    </MedplumProvider>
  </MantineProvider>
);
```

The bundled `PatientSummaryStates` export provides populated, empty, two-patient, and six-generated-patient examples.
The repository's Storybook also accepts the same state through `parameters.mockState`; its
decorator loads a fresh client and freezes the clock. An app using the helpers directly controls
its own clock. Set `parameters: { docs: { story: { inline: false } } }` on story files using
`mockState`, so each Docs story gets an iframe and its own clock.

The mock client ships a subset of search parameters. For repository examples that need more,
add them to `packages/generator/src/mockclient.ts` and run `npm run mockclient --workspace
@medplum/generator` to regenerate the shared JSON. Unknown search parameters return no matches.

## Typing and validation

The generator reuses Medplum's StructureDefinition parser, datatype schemas, element contexts,
and value comparison helpers. It runs in the browser and in Node. Primitive code choices are
precomputed from bundled definitions through the existing ValueSet helper. Contributors regenerate
that metadata with `npm run mockclient --workspace @medplum/generator`; screen authors do not need
a fixture build step.

Use `@medplum/fhirtypes` to check authored resource fields and values. `values` and the returned
resources use the base resource type; supplying a runtime profile does not narrow that TypeScript
type. Required generated values are structural examples, not clinically meaningful defaults.
The helpers do not validate FHIRPath rules, terminology membership, or full profile conformance.
Use separate validation when those guarantees matter; see [profiles](/docs/fhir-datastore/profiles)
for profile validation and generated TypeScript types.

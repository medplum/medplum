---
title: Build a screen with mock data
---

Use `generateMockResources`, `createMockState`, and `createMockClient` from `@medplum/mock`
to preview a screen without a Medplum backend. A Mock State contains the resources the screen uses and named entry points.
You can reuse it in an app, a demo, a test, or Storybook.

## Generate data from StructureDefinitions

Generate a batch, request optional fields, and supply the values that matter to your screen:

```ts
import { createReference } from '@medplum/core';
import { generateMockResources, createMockState, createMockClient } from '@medplum/mock';

const patients = generateMockResources('Patient', 6, {
  fields: ['name.given', 'birthDate'],
  values: { name: [{ family: 'Demo' }] },
});

const observations = generateMockResources('Observation', 6, {
  values: (index) => ({
    subject: createReference(patients[index]),
    code: { text: 'Example measurement' },
    valueInteger: index + 1,
  }),
});

const state = createMockState([...patients, ...observations], { firstPatient: patients[0] });
const medplum = await createMockClient(state);
```

The patients receive unique IDs, generated given names and birth dates, and the family name
`Demo`. Other optional fields remain absent. The Observations receive required status values
from the bundled code lists; their subjects and measurements come from the callback.

Generation uses the base StructureDefinitions bundled with the mock package. It fills required
fields and optional paths listed in `fields`. Base Patient has no required demographic fields,
so generating Patients without `fields` produces resources with only a resource type and ID.
Nested paths such as `name.given` fill that field in each array entry. Requesting a whole name
with `fields: ['name']` generates its display text. For complex structures without a display or
value field, request the child paths you need.

`values` accepts a typed partial resource or a callback receiving a zero-based index. Supplied
values are preserved, including nested fields, zero and false. An authored choice such as
`medicationReference` prevents generation of `medicationCodeableConcept`. Supplying both causes
an error. Generated reference placeholders contain display text only: supply actual references
when the screen searches for or follows related resources.

The same arguments produce the same fixture values and IDs. Dates use a fixed UTC baseline of
May 4, 2020. Use `idPrefix` when combining multiple batches of the same resource type, or supply
IDs in `values`. Loading data into MockClient still generates version metadata and timestamps;
that metadata is not deterministic unless controlled separately.

The generator supports bundled base definitions, including the twelve resource types used in
the patient overview. Unknown types or field paths, unavailable code lists, and unsupported
required structures fail with an error. Profile generation and clinical realism are outside
this API's guarantees. Generated statuses can affect screen filters: supply a status explicitly
when the screen requires one. Clinical codes and meaningful measurements belong to the author.

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

The generator reuses Medplum's StructureDefinition parser, datatype schemas and defaults helper.
Its primitive code choices come from the bundled definitions through the existing ValueSet
helper. It runs in the browser and in Node. Contributors regenerate the metadata with
`npm run mockclient --workspace @medplum/generator`; screen authors do not need a build step.

Use `@medplum/fhirtypes` to check authored resource fields and values. `values` is typed and
`fields` paths are checked at runtime. Required generated values are structural examples,
not clinically meaningful defaults. The helpers do not validate FHIRPath rules, terminology
membership, or profile conformance. Use separate validation when those guarantees matter.

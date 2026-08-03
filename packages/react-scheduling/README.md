# Medplum Scheduling React Component Library

The Medplum Scheduling React Component Library provides UI intended for working with Medplum's Scheduling API.

Check out a live demo: <https://storybook.medplum.com/>

## Alpha

This package is under active development and subject to breaking changes. Learn more at https://www.medplum.com/docs/compliance/alpha-beta.


## Installation

Add as a dependency:

```
npm install @medplum/react-scheduling
```

Note the following peer dependencies:

- [react](https://www.npmjs.com/package/react)
- [react-dom](https://www.npmjs.com/package/react-dom)
- [@mantine/core](https://www.npmjs.com/package/@mantine/core)
- [@mantine/hooks](https://www.npmjs.com/package/@mantine/hooks)
- [@medplum/core](https://www.npmjs.com/package/@medplum/core)


## Basic Usage

This is intended to be used inside an application built using [`@medplum/react`](https://www.npmjs.com/package/@medplum/react).

```tsx
import { getReferenceString } from '@medplum/core';
import type { Practitioner } from '@medplum/fhirtypes';
import { useMedplumProfile, useSearchResources } from '@medplum/react';
import { Calendar } from '@medplum/react-scheduling'

export function ScheduleView(props: { practitioner: Practitioner }) {
  const profile = useMedplumProfile();
  const [appointments, loading] = useSearchResources(
    'Appointment',
    {
      actor: getReferenceString(props.practitioner)
    }
  );
  if (loading) {
    return <>Loading...</>;
  }
  return <Calendar appointments={appointments} slots={[]} />
}
```


## About Medplum

Medplum is a healthcare platform that helps you quickly develop high-quality compliant applications. Medplum includes a FHIR server, React component library, and developer app.

## License

[Apache 2.0](../../LICENSE.txt)

# Medplum React Hooks Library

The Medplum React Hooks Library provides non-UI React features for your application.

Most users will want the full Medplum React Component Library, `@medplum/react`. However, that library has peer dependencies on Mantine, which may not be desired.

## Key Features

- `useMedplum` - handles shared global instance of `MedplumClient`
- `useResource` - reads a resource by ID or reference with intelligent caching
- `useSearch` - performs a FHIR search with intelligent state management

## Installation

Add as a dependency:

```
npm install @medplum/react-hooks
```

Note the following peer dependencies:

- [@medplum/core](https://www.npmjs.com/package/@medplum/core)
- [react](https://www.npmjs.com/package/react)
- [react-dom](https://www.npmjs.com/package/react-dom)

## Setup

```tsx
import { MedplumClient } from '@medplum/core';
import { MedplumProvider } from '@medplum/react';

const medplum = new MedplumClient();

export function App() {
  return (
    <MedplumProvider medplum={medplum}>
      <MyPage1 />
      <MyPage2 />
      <Etc />
    </MedplumProvider>
  );
}
```

For more details on how to setup `MedplumClient`, refer to the docs for [`medplum`](https://www.npmjs.com/package/medplum).

## `useMedplum`

```tsx
import { useMedplum } from '@medplum/react-hooks';

export function MyComponent() {
  const medplum = useMedplum();
  return <div>{JSON.stringify(medplum.getProfile())}</div>;
}
```

## About Medplum

Medplum is a healthcare platform that helps you quickly develop high-quality compliant applications. Medplum includes a FHIR server, React component library, and developer app.

## License

Apache 2.0. Copyright &copy; Medplum 2023

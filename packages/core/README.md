# Medplum JS Client Library

The Medplum JS Client Library is a pure TypeScript library for calling a FHIR server from the browser.

## Key Features

- FHIR validation and operations
- FHIR client to create, read, update, delete, patch, and search
- WebSockets for realtime communication
- Evaluation of [FhirPath](https://hl7.org/fhirpath/N1/index.html)
- No external dependencies

## Installation

Add as a dependency:

```bash
npm install @medplum/core
```

## Basic Usage

Create a new `MedplumClient`:

```ts
import { MedplumClient } from '@medplum/core';

const medplum = new MedplumClient();
```

Create a `MedplumClient` with additional configuration options:

```ts
import { MedplumClient } from '@medplum/core';

const medplum = new MedplumClient({
  baseUrl: 'https://www.example.com/fhir/R4/',
  clientId: 'MY_CLIENT_ID',
});
```

## Authenticate with client credentials

```ts
const medplum = new MedplumClient();
await medplum.startClientLogin(MY_CLIENT_ID, MY_CLIENT_SECRET);
```

## Authenticating with Medplum

If you are using Medplum as your FHIR server, you can use a direct sign-in API to authenticate email and password.

Before you begin

1. Create a project in the [Medplum App](https://app.medplum.com/)
2. Enable Email/Password

After that, you can use the `startLogin()` method:

```ts
const loginResult = await medplum.startLogin({ email, password, remember });
const profile = await medplum.processCode(loginResult.code);
console.log(profile);
```

## Authenticating with OAuth

Authenticate with a FHIR server via OAuth2 redirect:

```ts
medplum.signInWithRedirect().then((user) => console.log(user));
```

## Search

Search for any resource using a [FHIR search](https://www.hl7.org/fhir/search.html) string:

```ts
search<K extends ResourceType>(
  resourceType: K,
  query?: URLSearchParams | string,
  options: RequestInit = {}
): ReadablePromise<Bundle<ExtractResource<K>>>
```

Example:

```ts
const bundle = await medplum.search('Patient', 'given=eve');
bundle.entry.forEach((entry) => console.log(entry.resource));
```

## Create

[Create resource](https://www.hl7.org/fhir/http.html#create):

```ts
createResource<T extends Resource>(resource: T): Promise<T>
```

Example:

```ts
medplum.createResource({
  resourceType: 'Observation',
  subject: {
    reference: 'Patient/123',
  },
  valueQuantity: {
    // ...
  },
  // ...
});
```

## Read a resource

[Read a resource by ID](https://www.hl7.org/fhir/http.html#read):

```ts
readResource<T extends Resource>(resourceType: string, id: string): Promise<T>
```

Example:

```ts
const patient = await medplum.readResource('Patient', '123');
```

## Read resource history

[Read resource history](https://www.hl7.org/fhir/http.html#history):

```ts
readHistory<T extends Resource>(resourceType: string, id: string): Promise<Bundle<T>>
```

Example:

```ts
const historyBundle = await medplum.readHistory('Patient', '123');
```

## Read resource version

[Read a specific version](https://www.hl7.org/fhir/http.html#vread):

```ts
readVersion<T extends Resource>(resourceType: string, id: string, vid: string): Promise<T>
```

Example:

```ts
const version = await medplum.readVersion('Patient', '123', '456');
```

## Update a resource

[Update a resource](https://www.hl7.org/fhir/http.html#update):

```ts
updateResource<T extends Resource>(resource: T): Promise<T>
```

Example:

```ts
const result = await medplum.updateResource({
  resourceType: 'Patient',
  id: '123',
  name: [
    {
      family: 'Smith',
      given: ['John'],
    },
  ],
});
console.log(result.meta.versionId);
```

## Delete a resource

[Delete a resource](https://www.hl7.org/fhir/http.html#delete):

```ts
deleteResource(resourceType: string, id: string): Promise<any>
```

Example:

```ts
await medplum.deleteResource('Patient', '123');
```

## Patch a resource

[Patch a resource](https://www.hl7.org/fhir/http.html#patch):

```ts
patchResource<T extends Resource>(resourceType: string, id: string, operations: Operation[]): Promise<T>
```

Example:

```ts
const result = await medplum.patchResource('Patient', '123', [
  { op: 'replace', path: '/name/0/family', value: 'Smith' },
]);
console.log(result.meta.versionId);
```

## GraphQL

[Execute a GraphQL query](https://www.hl7.org/fhir/graphql.html):

```ts
graphql(query: string, options?: RequestInit): Promise<any>
```

Example:

```ts
const result = await graphql(`
  {
    PatientList(name: "Alice") {
      name {
        given
        family
      }
    }
  }
`);
```

## About Medplum

Medplum is a healthcare platform that helps you quickly develop high-quality compliant applications. Medplum includes a FHIR server, React component library, and developer app.

## License

Apache 2.0. Copyright &copy; Medplum 2024

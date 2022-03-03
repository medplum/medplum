# Medplum

Medplum is a healthcare platform that helps you quickly develop high-quality compliant applications. Medplum includes a FHIR server, React component library, and developer app.

# Medplum JS Client Library

The Medplum JS Client Library is a pure TypeScript library for calling a FHIR server from the browser.

## Key Features

- FHIR validation and operations
- FHIR client to create, read, update, delete, patch, and search
- WebSockets for realtime communication
- Evaluation of [FhirPath](https://hl7.org/fhirpath/N1/index.html)
- No external dependencies

## Installation

```
npm install medplum
```

## Basic Usage

```typescript
import { MedplumClient } from '@medplum/core';

const medplum = new MedplumClient({
  baseUrl: 'https://www.example.com/fhir/R4/',
  clientId: 'MY_CLIENT_ID',
});
```

## Authenticating with OAuth

Authenticate with a FHIR server via OAuth2 redirect:

```typescript
medplum.signInWithRedirect().then((user) => console.log(user));
```

## Authenticating with Medplum

If you are using Medplum as your FHIR server, you can use a direct sign-in API to authenticate email and password.

Before you begin

1. Create a project in the [Medplum App](https://app.medplum.com/)
2. Enable Email/Password

After that, you can use the `startLogin()` method:

```typescript
const loginResult = await medplum.startLogin(email, password, remember);
const profile = await medplum.processCode(loginResult.code);
console.log(profile);
```

## Search

Search for any resource using a [FHIR search](https://www.hl7.org/fhir/search.html) string:

```typescript
medplum.search('Patient?given=eve').then((bundle) => {
  bundle.entry.forEach((entry) => console.log(entry.resource));
});
```

Search using a structured object:

```typescript
medplum
  .search({
    resourceType: 'Patient',
    filters: [
      {
        code: 'given',
        operator: Operator.EQUALS,
        value: 'eve',
      },
    ],
  })
  .then((bundle) => {
    bundle.entry.forEach((entry) => console.log(entry.resource));
  });
```

## Create

Create a new resource:

```typescript
medplum.create({
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

## Read

Read a resource by ID:

```typescript
medplum.read('Patient', '123');
```

Read resource history:

```typescript
medplum.readHistory('Patient', '123');
```

Read a specific version:

```typescript
medplum.readVersion('Patient', '123', '456');
```

## License

Apache 2.0. Copyright &copy; Medplum 2022

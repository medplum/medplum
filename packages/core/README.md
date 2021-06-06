# Medplum

Medplum is a healthcare platform that helps you quickly develop high-quality compliant applications.  Medplum includes a FHIR server, React component library, and developer console.

**Warning: This is Alpha code and not production ready.**

# Medplum JS Client Library

The Medplum JS Client Library is a pure TypeScript library for calling a FHIR server from the browser.

## Key Features

* FHIR validation and operations
* SSE for server side push
* Evaluation of [FhirPath](https://hl7.org/fhirpath/N1/index.html)
* No external dependencies

## Installation

```
npm install medplum
```

## Basic Usage

```typescript
import { MedplumClient } from '@medplum/core';

const medplum = new MedplumClient({
    baseUrl: 'https://www.example.com/fhir/R4/',
    clientId: 'MY_CLIENT_ID'
});
```

## Authenticating with OAuth

Authenticate with a FHIR server via OAuth2 redirect:

```typescript
medplum.signInWithRedirect().then(user => console.log(user));
```

## Authenticating with Medplum

If you are using Medplum as your FHIR server, you can use a direct sign-in API to authenticate email and password.

Before you begin

1. Create a project in the [Medplum Console](https://console.medplum.com/)
2. Enable Email/Password

After that, you can use the `signIn()` method:

```typescript
medplum.signIn(email, password, role, scope).then(user => console.log(user));
```

## Search

Search for any resource:

```typescript
medplum.search('Patient?given=eve').then(bundle => {
  bundle.entry.forEach(entry => console.log(entry.resource));
});
```

## Create

Create a new resource:

```typescript
medplum.create({
  resourceType: 'Observation',
  subject: {
    reference: 'Patient/123'
  },
  valueQuantity: {
    // ...
  }
  // ...
});
```

## License

Apache 2.0.  Copyright &copy; Medplum 2021

# Medplum Mock Library

Provides the `MockClient` class and a large number of mocked endpoints and resources.

For example:

- `GET fhir/R4/Patient/123` returns Homer Simpson
- `GET fhir/R4/Practitioner/123` returns Dr. Alice Smith
- `GET fhir/R4/Organization/123` returns Test Organization

## Installation

Add as a dependency:

```bash
npm install @medplum/mock
```

Note the following peer dependencies:

- [@medplum/core](https://www.npmjs.com/package/@medplum/core)
- [@medplum/fhir-router](https://www.npmjs.com/package/@medplum/fhir-router)
- If you want to use JSONPatch:
  - [rfc6902](https://www.npmjs.com/package/rfc6902)
- If you want to use GraphQL:
  - [graphql](https://www.npmjs.com/package/graphql)
  - [dataloader](https://www.npmjs.com/package/dataloader)

## Usage

Create a new mock client:

```ts
const client = new MockClient();
```

Read a `Patient` resource:

```ts
const patient = await client.readResource('Patient', '123');
```

`MockClient` is API compatible with `MedplumClient` in [@medplum/core](https://www.npmjs.com/package/@medplum/core). Please refer to `MedplumClient` for full documentation on client capabilities.

## About Medplum

Medplum is a healthcare platform that helps you quickly develop high-quality compliant applications. Medplum includes a FHIR server, React component library, and developer app.

## License

Apache 2.0. Copyright &copy; Medplum 2024

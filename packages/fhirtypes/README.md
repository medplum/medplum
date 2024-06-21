# Medplum FHIR Type Definitions

This library contains [TypeScript](https://www.typescriptlang.org/) type definitions for all [R4 types](https://hl7.org/fhir/R4/valueset-resource-types.html).

## Installation

Add as a dependency:

```bash
npm install --save-dev @medplum/fhirtypes
```

## Basic Usage

Consider the following untyped code:

```ts
const myPatient = {
  resourceType: 'Patient',
  name: 'George Washington',
};
```

Keen observers will note that `Patient.name` should not be a string. Instead, it should be an array of `HumanName` objects.

Let's add the type definition and see what happens:

```ts
import { Patient } from '@medplum/fhirtypes';

const myPatient: Patient = {
  resourceType: 'Patient',
  name: 'George Wasington',
};
```

Now "name" is a compile error. Developer tools with TypeScript support should provide feedback. For example, VS Code adds red squigglies and a helpful error message:

![Medplum fhirtypes screenshot](https://user-images.githubusercontent.com/749094/146444130-ac3a2c5d-3a9a-429d-8db3-5581986c05dc.png)

And now you will receive typeahead support:

![Medplum fhirtypes typeahead](https://user-images.githubusercontent.com/749094/146444465-974f6a3e-f655-4212-893b-fad14b1c4386.png)

So we can build a well-formed example:

```ts
import { Patient } from '@medplum/fhirtypes';

const myPatient: Patient = {
  resourceType: 'Patient',
  name: [
    {
      given: ['George'],
      family: 'Washington',
    },
  ],
};
```

## About Medplum

Medplum is a healthcare platform that helps you quickly develop high-quality compliant applications. Medplum includes a FHIR server, React component library, and developer app.

## License

Apache 2.0. Copyright &copy; Medplum 2024

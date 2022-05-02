# Medplum FHIRPath Library

The Medplum FHIRPath Library is a pure TypeScript library for evaluating [FHIRPath](https://hl7.org/fhirpath/) expressions.

## Installation

Add as a dependency:

```bash
npm install @medplum/fhirpath
```

## Basic Usage

```ts
import { Patient } from '@medplum/fhirtypes';
import { evalFhirPath } from '@medplum/fhirpath';

const patient: Patient = {
  resourceType: 'Patient',
  name: [
    {
      given: ['John'],
      family: 'Doe',
    },
  ],
  birthDate: '1980-01-01',
};

console.log(evalFhirPath('birthDate', patient));
```

## About Medplum

Medplum is a healthcare platform that helps you quickly develop high-quality compliant applications. Medplum includes a FHIR server, React component library, and developer app.

## License

Apache 2.0. Copyright &copy; Medplum 2022

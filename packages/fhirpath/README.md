# Medplum FHIRPath Library

The Medplum FHIRPath Library is a pure TypeScript library for evaluating [FHIRPath](https://hl7.org/fhirpath/) expressions.

## Installation

```bash
npm install --save-dev @medplum/fhirpath
```

## Basic Usage

```typescript
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

## License

Apache 2.0. Copyright &copy; Medplum 2021

import { ElementDefinition } from '@medplum/fhirtypes';
import { Meta } from '@storybook/react';
import React from 'react';
import { CodeableConceptInput } from './CodeableConceptInput';
import { Document } from '../Document/Document';

export default {
  title: 'Medplum/CodeableConceptInput',
  component: CodeableConceptInput,
} as Meta;

const maritalStatusDefinition: ElementDefinition = {
  id: 'Patient.maritalStatus',
  path: 'Patient.maritalStatus',
  short: 'Marital (civil) status of a patient',
  definition: "This field contains a patient's most recent marital (civil) status.",
  requirements: 'Most, if not all systems capture it.',
  min: 0,
  max: '1',
  base: {
    path: 'Patient.maritalStatus',
    min: 0,
    max: '1',
  },
  type: [
    {
      code: 'CodeableConcept',
    },
  ],
  binding: {
    extension: [
      {
        url: 'http://hl7.org/fhir/StructureDefinition/elementdefinition-bindingName',
        valueString: 'MaritalStatus',
      },
      {
        url: 'http://hl7.org/fhir/StructureDefinition/elementdefinition-isCommonBinding',
        valueBoolean: true,
      },
    ],
    strength: 'extensible',
    description: 'The domestic partnership status of a person.',
    valueSet: 'http://hl7.org/fhir/ValueSet/marital-status',
  },
};

export const Basic = (): JSX.Element => (
  <Document>
    <CodeableConceptInput name="foo" property={maritalStatusDefinition} onChange={console.log} />
  </Document>
);

export const DefaultValue = (): JSX.Element => (
  <Document>
    <CodeableConceptInput
      name="foo"
      property={maritalStatusDefinition}
      defaultValue={{ coding: [{ code: 'M', display: 'Married' }] }}
      onChange={console.log}
    />
  </Document>
);

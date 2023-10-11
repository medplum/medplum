import { InternalSchemaElement } from '@medplum/core';
import { Meta } from '@storybook/react';
import React from 'react';
import { Document } from '../Document/Document';
import { CodeableConceptInput } from './CodeableConceptInput';

export default {
  title: 'Medplum/CodeableConceptInput',
  component: CodeableConceptInput,
} as Meta;

const maritalStatusDefinition: InternalSchemaElement = {
  path: 'Patient.maritalStatus',
  description: "This field contains a patient's most recent marital (civil) status.",
  min: 0,
  max: 1,
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

import { createReference } from '@medplum/core';
import { Annotation } from '@medplum/fhirtypes';
import { DrAliceSmith } from '@medplum/mock';
import { Meta } from '@storybook/react';
import { Document } from '../Document/Document';
import { AnnotationInput } from './AnnotationInput';

export default {
  title: 'Medplum/AnnotationInput',
  component: AnnotationInput,
} as Meta;

export const Basic = (): JSX.Element => (
  <Document>
    <AnnotationInput
      defaultValue={
        {
          authorReference: createReference(DrAliceSmith),
          text: 'This is an annotation',
        } as Annotation
      }
      onChange={console.log}
      name="annotation"
      path="Extension.value[x]"
    />
  </Document>
);

export const Disabled = (): JSX.Element => (
  <Document>
    <AnnotationInput
      disabled={true}
      defaultValue={
        {
          authorReference: createReference(DrAliceSmith),
          text: 'This is an annotation',
        } as Annotation
      }
      onChange={console.log}
      name="annotation"
      path="Extension.value[x]"
    />
  </Document>
);

import { Meta } from '@storybook/react';
import React from 'react';
import { Document } from '../Document';
import { ErrorBoundary } from '../ErrorBoundary';
import { ReferenceRangeEditor } from '../ReferenceRangeEditor';
import { HDLDefinition, TestosteroneDefinition } from './referenceLab';

export default {
  title: 'Medplum/ReferenceRangeEditor',
  component: ReferenceRangeEditor,
} as Meta;

export const HDL = (): JSX.Element => {
  return (
    <Document>
      <ErrorBoundary>
        <ReferenceRangeEditor
          definition={HDLDefinition}
          onSubmit={(definition) => console.dir(definition, { depth: null })}
        />
      </ErrorBoundary>
    </Document>
  );
};

export const Testosterone = (): JSX.Element => {
  return (
    <Document>
      <ErrorBoundary>
        <ReferenceRangeEditor
          definition={TestosteroneDefinition}
          onSubmit={(definition) => console.dir(definition, { depth: null })}
        />
      </ErrorBoundary>
    </Document>
  );
};

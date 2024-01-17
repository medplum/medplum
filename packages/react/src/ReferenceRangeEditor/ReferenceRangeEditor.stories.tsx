import { ObservationDefinition } from '@medplum/fhirtypes';
import { Meta } from '@storybook/react';
import { Document } from '../Document/Document';
import { ErrorBoundary } from '../ErrorBoundary/ErrorBoundary';
import { HDLDefinition, KidneyLabDefinition, TestosteroneDefinition } from '../stories/referenceLab';
import { ReferenceRangeEditor } from './ReferenceRangeEditor';

export default {
  title: 'Medplum/ReferenceRangeEditor',
  component: ReferenceRangeEditor,
} as Meta;

export const Empty = (): JSX.Element => {
  return (
    <Document>
      <ErrorBoundary>
        <ReferenceRangeEditor
          definition={{ resourceType: 'ObservationDefinition' } as ObservationDefinition}
          onSubmit={(definition) => console.dir(definition, { depth: null })}
        />
      </ErrorBoundary>
    </Document>
  );
};

export const HDL = (): JSX.Element => {
  return (
    <Document>
      <ErrorBoundary>
        <ReferenceRangeEditor
          definition={HDLDefinition}
          onSubmit={(definition) => console.debug('Definition', definition)}
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
          onSubmit={(definition) => console.debug('Definition', definition)}
        />
      </ErrorBoundary>
    </Document>
  );
};

export const ACR = (): JSX.Element => {
  return (
    <Document>
      <ErrorBoundary>
        <ReferenceRangeEditor
          definition={KidneyLabDefinition}
          onSubmit={(definition) => console.debug('Definition', definition)}
        />
      </ErrorBoundary>
    </Document>
  );
};

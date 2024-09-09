import { Meta } from '@storybook/react';
import { Document } from '../Document/Document';
import { ErrorBoundary } from './ErrorBoundary';

export default {
  title: 'Medplum/ErrorBoundary',
  component: ErrorBoundary,
} as Meta;

export const Basic = (): JSX.Element => {
  function ErrorComponent(): JSX.Element {
    throw new Error('Error');
  }

  return (
    <Document>
      <div>Outside Error Boundary</div>
      <ErrorBoundary>
        <div>Inside Error Boundary</div>
        <ErrorComponent />
      </ErrorBoundary>
    </Document>
  );
};

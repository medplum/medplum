import { Alert } from '@mantine/core';
import { normalizeErrorString } from '@medplum/core';
import { IconAlertCircle } from '@tabler/icons-react';
import React, { ErrorInfo, ReactNode } from 'react';

export interface ErrorBoundaryProps {
  children: ReactNode;
}

export interface ErrorBoundaryState {
  error?: any;
}

/**
 * ErrorBoundary is a React component that handles errors in its child components.
 * See: https://reactjs.org/docs/error-boundaries.html
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState;

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {};
  }

  static getDerivedStateFromError(error: any): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('Uncaught error:', error, errorInfo);
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <Alert icon={<IconAlertCircle size={16} />} title="Something went wrong" color="red">
          {normalizeErrorString(this.state.error)}
        </Alert>
      );
    }

    return this.props.children;
  }
}

import { Title } from '@mantine/core';
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
      return <Title>Something went wrong.</Title>;
    }

    return this.props.children;
  }
}

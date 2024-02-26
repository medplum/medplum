import { Alert } from '@mantine/core';
import { normalizeErrorString } from '@medplum/core';
import { IconAlertCircle } from '@tabler/icons-react';
import { Component, ErrorInfo, ReactNode } from 'react';

export interface ErrorBoundaryProps {
  readonly children: ReactNode;
}

export interface ErrorBoundaryState {
  readonly error?: Error;
  readonly lastLocation: string;
}

/**
 * ErrorBoundary is a React component that handles errors in its child components.
 * See: https://reactjs.org/docs/error-boundaries.html
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  readonly state: ErrorBoundaryState;

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { lastLocation: window.location.toString() };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error, lastLocation: window.location.toString() };
  }

  componentDidUpdate(_prevProps: ErrorBoundaryProps, _prevState: ErrorBoundaryState): void {
    if (window.location.toString() !== this.state.lastLocation) {
      this.setState({
        lastLocation: window.location.toString(),
        error: undefined,
      });
    }
  }

  shouldComponentUpdate(nextProps: ErrorBoundaryProps, nextState: ErrorBoundaryState): boolean {
    if (this.props.children !== nextProps.children) {
      return true;
    }
    if (nextState.error && !this.state.error) {
      return true;
    }
    if (this.state.lastLocation !== window.location.toString()) {
      return true;
    }
    return false;
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

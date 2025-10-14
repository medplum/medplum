// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert } from '@mantine/core';
import { locationUtils, normalizeErrorString } from '@medplum/core';
import { IconAlertCircle } from '@tabler/icons-react';
import type { ErrorInfo, ReactNode } from 'react';
import { Component } from 'react';

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
    this.state = { lastLocation: locationUtils.getLocation() };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error, lastLocation: locationUtils.getLocation() };
  }

  componentDidUpdate(_prevProps: ErrorBoundaryProps, _prevState: ErrorBoundaryState): void {
    if (locationUtils.getLocation() !== this.state.lastLocation) {
      this.setState({
        lastLocation: locationUtils.getLocation(),
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
    if (this.state.lastLocation !== locationUtils.getLocation()) {
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

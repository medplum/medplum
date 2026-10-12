// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { locationUtils } from '@medplum/core';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import type { JSX } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { render, screen } from '../test-utils/render';
import { ErrorBoundary } from './ErrorBoundary';

function ErrorComponent(): JSX.Element {
  throw new Error('Error');
}

interface TestAppProps {
  shouldNavigate?: boolean;
}

function TestApp(props: TestAppProps): JSX.Element {
  const { shouldNavigate } = props;
  const [shouldError, setShouldError] = useState(true);
  const [, setCounter] = useState(0);
  const rerender = useCallback((): void => setCounter((s) => s + 1), []);

  useEffect(() => {
    setShouldError(false);
  }, []);

  useEffect(() => {
    if (shouldNavigate) {
      locationUtils.getLocation = () => '/another_url';
      rerender();
    }
  }, [shouldNavigate, rerender]);

  return (
    <div>
      <div>outside</div>
      <ErrorBoundary>
        <div>inside</div>
        {shouldError && <ErrorComponent />}
      </ErrorBoundary>
    </div>
  );
}

describe('ErrorBoundary', () => {
  test('Renders children', () => {
    render(
      <div>
        <div>outside</div>
        <ErrorBoundary>
          <div>inside</div>
        </ErrorBoundary>
      </div>
    );
    expect(screen.getByText('outside')).toBeInTheDocument();
    expect(screen.getByText('inside')).toBeInTheDocument();
  });

  test('Handles error', () => {
    console.error = vi.fn();
    const onError = vi.fn();
    render(
      <MedplumProvider medplum={new MockClient()} onError={onError}>
        <div>outside</div>
        <ErrorBoundary>
          <div>inside</div>
          <ErrorComponent />
        </ErrorBoundary>
      </MedplumProvider>
    );
    expect(screen.getByText('outside')).toBeInTheDocument();
    expect(screen.queryByText('inside')).toBeNull();
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(onError).toHaveBeenCalledExactlyOnceWith(new Error('Error'), {
      source: 'ErrorBoundary',
      message: 'Render error',
      errorInfo: { componentStack: expect.stringContaining('ErrorComponent') },
    });
  });

  test('Clears error on page navigation', async () => {
    console.error = vi.fn();
    const { rerender } = render(<TestApp shouldNavigate={false} />);
    expect(screen.getByText('outside')).toBeInTheDocument();
    expect(screen.queryByText('inside')).toBeNull();
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(console.error).toHaveBeenCalled();

    rerender(<TestApp shouldNavigate={true} />);

    expect(screen.getByText('outside')).toBeInTheDocument();
    expect(screen.getByText('inside')).toBeInTheDocument();
    expect(screen.queryByText('Something went wrong')).toBeNull();
  });
});

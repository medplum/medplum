// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { locationUtils } from '@medplum/core';
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
    console.error = jest.fn();
    render(
      <div>
        <div>outside</div>
        <ErrorBoundary>
          <div>inside</div>
          <ErrorComponent />
        </ErrorBoundary>
      </div>
    );
    expect(screen.getByText('outside')).toBeInTheDocument();
    expect(screen.queryByText('inside')).toBeNull();
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(console.error).toHaveBeenCalled();
  });

  test('Clears error on page navigation', async () => {
    console.error = jest.fn();
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

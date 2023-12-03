import { render, screen } from '@testing-library/react';
import { ErrorBoundary } from './ErrorBoundary';

function ErrorComponent(): JSX.Element {
  throw new Error('Error');
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
});

import { useCallback, useEffect, useState } from 'react';
import { render, screen } from '../test-utils/render';
import { ErrorBoundary } from './ErrorBoundary';

function ErrorComponent(): JSX.Element {
  throw new Error('Error');
}

class MockLocation {
  #href: string;
  constructor() {
    this.#href = 'http://localhost/';
  }
  get href(): string {
    return this.#href;
  }
  set href(val: string) {
    this.#href = new URL(val, this.#href).toString();
  }
  toString(): string {
    return this.#href;
  }
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
      window.location.href = '/another_url';
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
  let originalLocation: Location;

  beforeAll(() => {
    originalLocation = window.location;
  });

  beforeEach(() => {
    Object.defineProperty(window, 'location', {
      value: new MockLocation(),
      enumerable: true,
      configurable: true,
    });
  });

  afterAll(() => {
    Object.defineProperty(window, 'location', {
      value: originalLocation,
      enumerable: true,
      configurable: true,
    });
  });

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

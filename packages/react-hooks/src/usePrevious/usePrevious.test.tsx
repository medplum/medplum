import { MockClient } from '@medplum/mock';
import { RenderResult, render, screen } from '@testing-library/react';
import { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { MedplumProvider } from '../MedplumProvider/MedplumProvider';
import { usePrevious } from './usePrevious';

interface TestComponentProps {
  value: boolean;
}

function TestComponent(props: TestComponentProps): JSX.Element {
  const prevVal = usePrevious(props.value);
  return <div data-testid="test-component">{prevVal?.toString() ?? 'no value'}</div>;
}

describe('usePrevious', () => {
  let medplum: MockClient;

  beforeAll(() => {
    medplum = new MockClient();
  });

  function setup(children: ReactNode): RenderResult {
    return render(children, {
      wrapper: ({ children }) => (
        <MemoryRouter>
          <MedplumProvider medplum={medplum}>{children}</MedplumProvider>
        </MemoryRouter>
      ),
    });
  }

  test('Returns the value from the previous render', async () => {
    const { rerender } = setup(<TestComponent value={false} />);
    let el = screen.getByTestId('test-component');
    expect(el).toBeInTheDocument();
    expect(el.innerHTML).toBe('no value');
    rerender(<TestComponent value={true} />);
    el = screen.getByTestId('test-component');
    expect(el.innerHTML).toBe('false');
  });
});

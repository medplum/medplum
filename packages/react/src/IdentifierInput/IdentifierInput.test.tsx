import { Identifier } from '@medplum/fhirtypes';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { IdentifierInput } from './IdentifierInput';

describe('IdentifierInput', () => {
  test('Renders', () => {
    render(<IdentifierInput name="a" defaultValue={{ system: 'x', value: 'y' }} />);
    expect(screen.getByDisplayValue('x')).toBeDefined();
    expect(screen.getByDisplayValue('y')).toBeDefined();
  });

  test('Renders undefined value', () => {
    render(<IdentifierInput name="a" />);
    expect(screen.getByPlaceholderText('System')).toBeDefined();
    expect(screen.getByPlaceholderText('Value')).toBeDefined();
  });

  test('Set value', async () => {
    let lastValue: Identifier | undefined = undefined;

    render(<IdentifierInput name="a" onChange={(value) => (lastValue = value)} />);

    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText('System'), {
        target: { value: 's' },
      });
    });

    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText('Value'), {
        target: { value: 'v' },
      });
    });

    expect(lastValue).toBeDefined();
    expect(lastValue).toMatchObject({ system: 's', value: 'v' });
  });
});

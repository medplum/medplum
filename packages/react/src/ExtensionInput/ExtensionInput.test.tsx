import { Identifier } from '@medplum/fhirtypes';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { ExtensionInput } from './ExtensionInput';

describe('ExtensionInput', () => {
  test('Renders', () => {
    render(<ExtensionInput name="a" defaultValue={{ url: 'https://example.com' }} />);
    expect(screen.getByTestId('extension-input')).toBeDefined();
  });

  test('Renders undefined value', () => {
    render(<ExtensionInput name="a" />);
    expect(screen.getByTestId('extension-input')).toBeDefined();
  });

  test('Set value', async () => {
    let lastValue: Identifier | undefined = undefined;

    render(<ExtensionInput name="a" onChange={(value) => (lastValue = value)} />);

    await act(async () => {
      fireEvent.change(screen.getByTestId('extension-input'), {
        target: { value: '{"url":"https://foo.com"}' },
      });
    });

    expect(lastValue).toBeDefined();
    expect(lastValue).toMatchObject({ url: 'https://foo.com' });
  });
});

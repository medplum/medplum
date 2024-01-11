import { Identifier } from '@medplum/fhirtypes';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { ExtensionInput, ExtensionInputProps } from './ExtensionInput';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';

const medplum = new MockClient();

const defaultProps: ExtensionInputProps = {
  name: 'a',
  path: 'Resource.extension',
  onChange: undefined,
  outcome: undefined,
  propertyType: { code: 'Extension', profile: [] },
};

describe('ExtensionInput', () => {
  async function setup(props: ExtensionInputProps): Promise<void> {
    await act(async () => {
      render(
        <MedplumProvider medplum={medplum}>
          <ExtensionInput {...props} />
        </MedplumProvider>
      );
    });
  }

  test('Renders', async () => {
    await setup({
      ...defaultProps,
      defaultValue: { url: 'https://example.com' },
    });
    expect(screen.getByTestId('extension-json-input')).toBeDefined();
  });

  test('Renders undefined value', async () => {
    await setup({
      ...defaultProps,
    });
    expect(screen.getByTestId('extension-json-input')).toBeDefined();
  });

  test('Set value', async () => {
    let lastValue: Identifier | undefined = undefined;

    await setup({
      ...defaultProps,
      onChange: (value) => (lastValue = value),
    });

    await act(async () => {
      fireEvent.change(screen.getByTestId('extension-json-input'), {
        target: { value: '{"url":"https://foo.com"}' },
      });
    });

    expect(lastValue).toBeDefined();
    expect(lastValue).toMatchObject({ url: 'https://foo.com' });
  });
});

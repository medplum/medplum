import { Identifier } from '@medplum/fhirtypes';
import { act, fireEvent, render, screen } from '../test-utils/render';
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
      defaultValue: { url: 'https://example.com', valueBoolean: true },
    });
    expect(screen.getByTestId('url')).toBeInTheDocument();
    expect(screen.getByTestId('url')).toHaveValue('https://example.com');
    expect(screen.getByTestId('value[x]-selector')).toBeInTheDocument();
    expect(screen.getByTestId('value[x]')).toBeInTheDocument();
    expect(screen.getByTestId('value[x]')).toBeChecked();
  });

  test('Renders undefined value', async () => {
    await setup({
      ...defaultProps,
    });
    expect(screen.getByTestId('url')).toBeInTheDocument();
    expect(screen.getByTestId('url')).toHaveValue('');
    expect(screen.getByTestId('value[x]')).toBeInTheDocument();
    expect(screen.getByTestId('value[x]')).toHaveValue('');
  });

  test('Set value', async () => {
    let lastValue: Identifier | undefined = undefined;

    await setup({
      ...defaultProps,
      onChange: (value) => (lastValue = value),
    });

    await act(async () => {
      fireEvent.change(screen.getByTestId('url'), {
        target: { value: 'https://foo.com' },
      });
    });

    expect(lastValue).toBeDefined();
    expect(lastValue).toMatchObject({ url: 'https://foo.com' });
  });
});

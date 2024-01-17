import { HumanName } from '@medplum/fhirtypes';
import { act, fireEvent, render, screen } from '../test-utils/render';
import { HumanNameInput } from './HumanNameInput';

describe('HumanNameInput', () => {
  test('Renders', () => {
    render(
      <HumanNameInput
        name="test"
        path="test"
        onChange={jest.fn()}
        outcome={undefined}
        defaultValue={{ given: ['Alice'], family: 'Smith' }}
      />
    );

    const given = screen.getByPlaceholderText('Given') as HTMLInputElement;
    expect(given).toBeDefined();
    expect(given.value).toEqual('Alice');

    const family = screen.getByPlaceholderText('Family') as HTMLInputElement;
    expect(family).toBeDefined();
    expect(family.value).toEqual('Smith');
  });

  test('Change events', async () => {
    let lastValue = undefined;

    render(
      <HumanNameInput
        name="test"
        path="test"
        outcome={undefined}
        defaultValue={{}}
        onChange={(value) => (lastValue = value)}
      />
    );

    await act(async () => {
      fireEvent.change(screen.getByTestId('use'), {
        target: { value: 'official' },
      });
    });

    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText('Prefix'), {
        target: { value: 'Mr' },
      });
    });

    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText('Given'), {
        target: { value: 'Homer J' },
      });
    });

    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText('Family'), {
        target: { value: 'Simpson' },
      });
    });

    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText('Suffix'), {
        target: { value: 'Sr' },
      });
    });

    expect(lastValue).toMatchObject({
      use: 'official',
      prefix: ['Mr'],
      given: ['Homer', 'J'],
      family: 'Simpson',
      suffix: ['Sr'],
    });
  });

  test('Set blanks', async () => {
    let lastValue: HumanName | undefined = undefined;

    render(
      <HumanNameInput
        name="test"
        path="test"
        outcome={undefined}
        defaultValue={{
          use: 'official',
          prefix: ['Mr'],
          given: ['Homer', 'J'],
          family: 'Simpson',
          suffix: ['Sr'],
        }}
        onChange={(value) => (lastValue = value)}
      />
    );

    await act(async () => {
      fireEvent.change(screen.getByTestId('use'), { target: { value: '' } });
    });

    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText('Prefix'), {
        target: { value: '' },
      });
    });

    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText('Given'), {
        target: { value: '' },
      });
    });

    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText('Family'), {
        target: { value: '' },
      });
    });

    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText('Suffix'), {
        target: { value: '' },
      });
    });

    expect(lastValue).toBeDefined();
    expect(JSON.stringify(lastValue)).toEqual('{}');
  });
});

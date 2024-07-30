import { Meta } from '@storybook/react';
import { AsyncAutocomplete } from './AsyncAutocomplete';

export default {
  title: 'Medplum/AsyncAutocomplete',
  component: MultiSelectAsyncAutocomplete,
} as Meta;

type Option = {
  system: string;
  code: string;
  display: string;
};

const options: Option[] = [
  { system: 'data:fruit', code: 'A', display: 'Apple' },
  { system: 'data:fruit', code: 'B', display: 'Banana' },
  { system: 'data:fruit', code: 'O', display: 'Orange' },
  { system: 'data:fruit', code: 'P', display: 'Pear' },
  { system: 'data:fruit', code: 'S', display: 'Strawberry' },
];

export function MultiSelectAsyncAutocomplete(): JSX.Element {
  return (
    <AsyncAutocomplete
      label="Multi Select Async Autocomplete"
      loadOptions={async (input: string, signal: AbortSignal) => {
        return new Promise<(typeof options)[number][]>((resolve, reject) => {
          setTimeout(() => {
            if (signal.aborted) {
              reject(new Error('aborted'));
              return;
            }

            resolve(
              options.filter(
                (o) =>
                  o.code.toLowerCase().includes(input.toLowerCase()) ||
                  o.display.toLowerCase().includes(input.toLowerCase())
              )
            );
          }, 50);
        });
      }}
      toOption={(option) => ({
        value: option.code,
        label: option.display,
        resource: option,
      })}
      onChange={console.log}
    />
  );
}

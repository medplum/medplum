// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, Code, Group, Title } from '@mantine/core';
import type { Meta } from '@storybook/react';
import type { JSX } from 'react';
import { useState } from 'react';
import type { AsyncAutocompleteOption } from './AsyncAutocomplete';
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

// This story helps explore some of the loading, cancellation, and autosubmit
// behaviors by making the search function take one second.
export function SlowAsyncAutocomplete(): JSX.Element {
  const [values, setValues] = useState<Option[]>([]);
  return (
    <>
      <AsyncAutocomplete
        label="Slow Multi Select Async Autocomplete with maxValues: 2"
        loadOptions={async (input: string, signal: AbortSignal) => {
          return new Promise<(typeof options)[number][]>((resolve, reject) => {
            setTimeout(() => {
              if (signal.aborted) {
                console.log('Request aborted');
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
            }, 1000);
          });
        }}
        toOption={(option) => ({
          value: option.code,
          label: option.display,
          resource: option,
        })}
        onChange={setValues}
        maxValues={2}
      />

      <Title order={6} mt="md">
        Values
      </Title>
      <code>{JSON.stringify(values)}</code>
    </>
  );
}

async function loadFruit(input: string): Promise<Option[]> {
  return options.filter(
    (o) => o.code.toLowerCase().includes(input.toLowerCase()) || o.display.toLowerCase().includes(input.toLowerCase())
  );
}

function fruitToOption(option: Option): AsyncAutocompleteOption<Option> {
  return { value: option.code, label: option.display, resource: option };
}

export function ControlledAsyncAutocomplete(): JSX.Element {
  const [values, setValues] = useState<Option[]>([options[0]]);
  return (
    <>
      <AsyncAutocomplete
        label="Controlled Async Autocomplete"
        value={values}
        loadOptions={loadFruit}
        toOption={fruitToOption}
        onChange={setValues}
        clearable
      />
      <Group mt="md">
        <Button variant="default" onClick={() => setValues([options[1]])}>
          Select Banana
        </Button>
        <Button variant="default" onClick={() => setValues([])}>
          Clear
        </Button>
      </Group>
      <Title order={6} mt="md">
        Values
      </Title>
      <Code>{JSON.stringify(values)}</Code>
    </>
  );
}

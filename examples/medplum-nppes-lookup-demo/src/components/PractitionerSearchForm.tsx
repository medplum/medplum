// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, Grid, Stack, TextInput } from '@mantine/core';
import type { FormEvent, JSX } from 'react';
import { useState } from 'react';
import type { PractitionerSearch } from '../practitioners';

export interface PractitionerSearchFormProps {
  readonly loading: boolean;
  readonly disabled: boolean;
  readonly onSubmit: (search: PractitionerSearch) => void;
}

/**
 * Search form for looking up another practitioner. Always searches individual providers (NPI-1).
 * Validation is left to the bot so its errors are visible.
 * @param props - The form props.
 * @returns The search form.
 */
export function PractitionerSearchForm(props: PractitionerSearchFormProps): JSX.Element {
  const [number, setNumber] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [taxonomy, setTaxonomy] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [postalCode, setPostalCode] = useState('');

  function handleSubmit(e: FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    props.onSubmit({
      enumeration_type: 'NPI-1',
      number,
      first_name: firstName,
      last_name: lastName,
      taxonomy_description: taxonomy,
      city,
      state: state.toUpperCase(),
      postal_code: postalCode,
    });
  }

  return (
    <form onSubmit={handleSubmit}>
      <Stack gap="sm">
        <TextInput
          label="NPI"
          description="10 digits"
          value={number}
          onChange={(e) => setNumber(e.currentTarget.value)}
        />
        <Grid>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <TextInput
              label="First name"
              description="Trailing * allowed"
              value={firstName}
              onChange={(e) => setFirstName(e.currentTarget.value)}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <TextInput
              label="Last name"
              description="Trailing * allowed"
              value={lastName}
              onChange={(e) => setLastName(e.currentTarget.value)}
            />
          </Grid.Col>
          <Grid.Col span={12}>
            <TextInput
              label="Specialty"
              description='e.g. "Internal Medicine"'
              value={taxonomy}
              onChange={(e) => setTaxonomy(e.currentTarget.value)}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 5 }}>
            <TextInput label="City" value={city} onChange={(e) => setCity(e.currentTarget.value)} />
          </Grid.Col>
          <Grid.Col span={{ base: 6, sm: 3 }}>
            <TextInput label="State" maxLength={2} value={state} onChange={(e) => setState(e.currentTarget.value)} />
          </Grid.Col>
          <Grid.Col span={{ base: 6, sm: 4 }}>
            <TextInput label="ZIP" value={postalCode} onChange={(e) => setPostalCode(e.currentTarget.value)} />
          </Grid.Col>
        </Grid>
        <Button type="submit" loading={props.loading} disabled={props.disabled}>
          Look up practitioner
        </Button>
      </Stack>
    </form>
  );
}

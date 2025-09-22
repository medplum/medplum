// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Group, InputWrapper, NumberInput, Radio, Stack } from '@mantine/core';
import { Parameters } from '@medplum/fhirtypes';
import { Form, SubmitButton, useMedplum } from '@medplum/react';
import { JSX, useState } from 'react';
import { startAsyncJobAsync } from '../SuperAdminStartAsyncJob';
import { SearchableMultiSelect } from './SearchableMultiSelect';

interface ConfigureGINIndexesFormProps {
  defaultGinPendingListLimit: number | undefined;
  availableTables: string[];
  onResponse: (response: Parameters) => void;
}

export function ConfigureGINIndexesForm({
  defaultGinPendingListLimit,
  availableTables,
  onResponse,
}: ConfigureGINIndexesFormProps): JSX.Element {
  const medplum = useMedplum();
  const [loading, setLoading] = useState(false);
  const [tableName, setTableName] = useState<string[]>([]);
  const [fastUpdate, setFastUpdate] = useState<'on' | 'off' | 'reset' | 'unspecified'>('unspecified');
  const [ginPendingListLimit, setGinPendingListLimit] = useState<'set' | 'reset' | 'unspecified'>('unspecified');
  const [ginPendingListLimitValue, setGinPendingListLimitValue] = useState<number | undefined>(undefined);

  const handleSubmit = (): void => {
    const toSubmit: {
      tableName: string[];
      fastUpdateAction?: 'set' | 'reset';
      fastUpdateValue?: boolean;
      ginPendingListLimitAction?: 'set' | 'reset';
      ginPendingListLimitValue?: number;
    } = {
      tableName,
    };

    if (fastUpdate === 'reset') {
      toSubmit.fastUpdateAction = 'reset';
    } else if (fastUpdate === 'on') {
      toSubmit.fastUpdateAction = 'set';
      toSubmit.fastUpdateValue = true;
    } else if (fastUpdate === 'off') {
      toSubmit.fastUpdateAction = 'set';
      toSubmit.fastUpdateValue = false;
    }
    if (ginPendingListLimit === 'reset') {
      toSubmit.ginPendingListLimitAction = 'reset';
    } else if (ginPendingListLimit === 'set') {
      toSubmit.ginPendingListLimitAction = 'set';
      toSubmit.ginPendingListLimitValue = ginPendingListLimitValue;
    }

    setLoading(true);
    startAsyncJobAsync<Parameters>(medplum, 'Configure GIN Indexes', 'fhir/R4/$db-configure-indexes', toSubmit)
      .then((res: any) => {
        onResponse(res);
      })
      .catch(() => {
        // startAsyncJobAsync shows a notification on error
      })
      .finally(() => {
        setLoading(false);
      });
  };

  return (
    <Form onSubmit={handleSubmit}>
      <Stack gap="sm" maw="800">
        <InputWrapper label="Table(s)">
          <SearchableMultiSelect
            data={availableTables}
            onChange={(value) => setTableName(value)}
            inputProps={{ name: 'tables', placeholder: 'e.g. Observation' }}
          />
        </InputWrapper>
        <Radio.Group
          name="fastUpdate"
          label="fastupdate"
          value={fastUpdate}
          onChange={(value) => setFastUpdate(value as 'on' | 'off' | 'reset' | 'unspecified')}
        >
          <Group h="36">
            <Radio size="sm" value="unspecified" label="unspecified" />
            <Radio size="sm" value="reset" label="reset to default (on)" />
            <Radio size="sm" value="off" label="off" />
            <Radio size="sm" value="on" label="on" />
          </Group>
        </Radio.Group>
        <Radio.Group
          name="ginPendingListLimit"
          label="gin_pending_list_limit"
          value={ginPendingListLimit}
          onChange={(value) => {
            setGinPendingListLimit(value as 'set' | 'reset' | 'unspecified');
            if (value !== 'set') {
              setGinPendingListLimitValue(undefined);
            }
          }}
        >
          <Group h="36">
            <Radio size="sm" value="unspecified" label="unspecified" />
            <Radio size="sm" value="reset" label={`reset to default (${defaultGinPendingListLimit}kB)`} />
            <Group>
              <Radio size="sm" value="set" label="Set to (kB)" />
              <NumberInput
                title="gin_pending_list_limit_value"
                name="gin_pending_list_limit_value"
                value={(ginPendingListLimit === 'set' ? ginPendingListLimitValue : '') || ''}
                disabled={ginPendingListLimit !== 'set'}
                required={ginPendingListLimit === 'set'}
                size="sm"
                w="100"
                min={64}
                max={2147483647}
                onChange={(value) => {
                  if (typeof value === 'number') {
                    setGinPendingListLimitValue(value);
                  } else {
                    setGinPendingListLimitValue(undefined);
                  }
                }}
              />
            </Group>
          </Group>
        </Radio.Group>
        <Group justify="center">
          <SubmitButton size="sm" loading={loading}>
            Update
          </SubmitButton>
        </Group>
      </Stack>
    </Form>
  );
}

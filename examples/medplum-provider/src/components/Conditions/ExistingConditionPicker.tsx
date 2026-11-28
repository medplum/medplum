// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Divider, Flex, Loader, Radio, Stack, Text, TextInput } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import type { WithId } from '@medplum/core';
import { getReferenceString, HTTP_HL7_ORG } from '@medplum/core';
import type { Coding, Condition, Patient } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import { IconSearch } from '@tabler/icons-react';
import type { JSX } from 'react';
import { Fragment, useEffect, useState } from 'react';
import { showErrorNotification } from '../../utils/notifications';
import { ConditionStatusBadge } from './ConditionStatusBadge';

const ICD10_CM_SYSTEM = HTTP_HL7_ORG + '/fhir/sid/icd-10-cm';
const SEARCH_COUNT = 20;
const DISPLAY_LIMIT = 5;

function getIcd10Coding(condition: Condition): Coding | undefined {
  return condition.code?.coding?.find((coding) => coding.system === ICD10_CM_SYSTEM && coding.code);
}

/**
 * Collapses duplicate Conditions to one row per ICD-10-CM code. Results arrive newest first, so the
 * most recently updated Condition for each code is kept.
 * @param conditions - The search results, sorted by -_lastUpdated.
 * @returns One Condition per ICD-10-CM code.
 */
function latestPerCode(conditions: WithId<Condition>[]): WithId<Condition>[] {
  const seen = new Set<string>();
  return conditions.filter((condition) => {
    const code = getIcd10Coding(condition)?.code;
    if (!code || seen.has(code)) {
      return false;
    }
    seen.add(code);
    return true;
  });
}

/**
 * Props for ExistingConditionPicker.
 * - patient: the patient whose current diagnoses are listed.
 * - excludeCodes: diagnosis codes already on the encounter, left out of the list.
 * - value: the chosen Condition, if any.
 * - onChange: called with the chosen Condition, or undefined when a new search clears the choice.
 */
export interface ExistingConditionPickerProps {
  readonly patient: WithId<Patient>;
  readonly excludeCodes: string[];
  readonly value: WithId<Condition> | undefined;
  readonly onChange: (condition: WithId<Condition> | undefined) => void;
}

export function ExistingConditionPicker(props: ExistingConditionPickerProps): JSX.Element {
  const { patient, excludeCodes, value, onChange } = props;
  const medplum = useMedplum();
  const [conditions, setConditions] = useState<WithId<Condition>[] | undefined>();
  const [query, setQuery] = useState('');
  const [debouncedQuery] = useDebouncedValue(query.trim(), 300);
  const [loadedKey, setLoadedKey] = useState<string | undefined>();
  const excludeCodesKey = excludeCodes.join(',');
  const requestKey = debouncedQuery + '\n' + excludeCodesKey;
  const searching = query.trim() !== debouncedQuery || loadedKey !== requestKey;

  useEffect(() => {
    const params: Record<string, string> = {
      subject: getReferenceString(patient),
      code: ICD10_CM_SYSTEM + '|',
      'clinical-status': 'active,recurrence,relapse',
      'verification-status:not': 'entered-in-error,refuted',
      _sort: '-_lastUpdated',
      _count: String(SEARCH_COUNT),
    };
    if (excludeCodesKey) {
      params['code:not'] = excludeCodesKey;
    }
    if (debouncedQuery) {
      params['code:text'] = debouncedQuery;
    }
    let active = true;
    medplum
      .searchResources('Condition', params, { cache: 'no-cache' })
      .then((results) => {
        if (active) {
          setConditions(latestPerCode(results).slice(0, DISPLAY_LIMIT));
          setLoadedKey(requestKey);
        }
      })
      .catch((err) => {
        if (active) {
          setConditions([]);
          setLoadedKey(requestKey);
          showErrorNotification(err);
        }
      });
    return () => {
      active = false;
    };
  }, [medplum, patient, excludeCodesKey, debouncedQuery, requestKey]);

  return (
    <>
      <TextInput
        mb="sm"
        aria-label="Search diagnoses"
        placeholder="Search by name"
        leftSection={<IconSearch size={16} />}
        rightSection={searching ? <Loader size="xs" aria-label="Searching" /> : undefined}
        value={query}
        onChange={(e) => {
          setQuery(e.currentTarget.value);
          onChange(undefined);
        }}
        data-autofocus
      />
      {conditions?.length === 0 && (
        <Text size="sm" c="dimmed">
          {debouncedQuery ? 'No matching diagnoses' : 'No other active diagnoses for this patient'}
        </Text>
      )}
      {conditions && conditions.length > 0 && (
        <Radio.Group
          value={value?.id ?? null}
          onChange={(id) => onChange(conditions.find((condition) => condition.id === id))}
        >
          <Stack gap={0}>
            {conditions.map((condition, idx) => {
              const coding = getIcd10Coding(condition);
              const display = coding?.display ?? condition.code?.text ?? '';
              return (
                <Fragment key={condition.id}>
                  {idx > 0 && <Divider />}
                  <Radio.Card
                    value={condition.id}
                    radius={0}
                    withBorder={false}
                    aria-label={[coding?.code, display].filter(Boolean).join(' ')}
                  >
                    <Flex align="center" gap="md" px="xs" py="sm">
                      <Radio.Indicator size="sm" />
                      <Text size="sm" fw={600} w={80}>
                        {coding?.code ?? ''}
                      </Text>
                      <Text size="sm" flex={1} miw={0} lineClamp={2} title={display}>
                        {display}
                      </Text>
                      <ConditionStatusBadge clinicalStatus={condition.clinicalStatus} />
                    </Flex>
                  </Radio.Card>
                </Fragment>
              );
            })}
          </Stack>
        </Radio.Group>
      )}
    </>
  );
}

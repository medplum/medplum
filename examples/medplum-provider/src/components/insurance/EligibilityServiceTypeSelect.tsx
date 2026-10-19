// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MantineSize } from '@mantine/core';
import { MultiSelect } from '@mantine/core';
import type { JSX } from 'react';
import { getServiceTypeDisplay } from '../../utils/eligibility';

/**
 * Props for EligibilityServiceTypeSelect.
 * @param codes - The service types recorded in Billing Settings, the only ones offered.
 * @param value - The service types this check sends.
 * @param onChange - Called with the service types kept for this check.
 * @param size - The Mantine input size.
 */
export interface EligibilityServiceTypeSelectProps {
  readonly codes: readonly string[];
  readonly value: readonly string[];
  readonly onChange: (codes: string[]) => void;
  readonly size?: MantineSize;
}

/**
 * Picks which of the recorded X12 service types one eligibility check asks about. It offers only the codes saved
 * on the Billing Settings Eligibility tab and flags an empty pick, since a check must ask about something.
 * @param props - The EligibilityServiceTypeSelect React props.
 * @returns The EligibilityServiceTypeSelect React node.
 */
export function EligibilityServiceTypeSelect(props: EligibilityServiceTypeSelectProps): JSX.Element {
  const { codes, value, onChange, size } = props;
  return (
    <MultiSelect
      label="Service types"
      size={size}
      data={codes.map((code) => ({ value: code, label: `${getServiceTypeDisplay(code)} (${code})` }))}
      value={[...value]}
      onChange={onChange}
      hidePickedOptions
      nothingFoundMessage="All recorded service types are picked"
      error={value.length === 0 ? 'Pick at least one service type' : undefined}
    />
  );
}

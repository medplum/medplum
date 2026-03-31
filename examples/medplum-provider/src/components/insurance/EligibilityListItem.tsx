// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Group, Stack, Text } from '@mantine/core';
import { formatDate } from '@medplum/core';
import type { CoverageEligibilityRequest } from '@medplum/fhirtypes';
import { MedplumLink } from '@medplum/react';
import cx from 'clsx';
import type { JSX } from 'react';
import classes from './EligibilityListItem.module.css';

interface EligibilityListItemProps {
  request: CoverageEligibilityRequest;
  isSelected: boolean;
  href: string;
}

export function EligibilityListItem({ request, isSelected, href }: EligibilityListItemProps): JSX.Element {
  const purposes = request.purpose?.map(formatPurpose).join(', ') ?? 'Eligibility Check';

  return (
    <MedplumLink to={href} underline="never">
      <Group
        align="flex-start"
        wrap="nowrap"
        className={cx(classes.contentContainer, { [classes.selected]: isSelected })}
      >
        <Stack gap={4} flex={1}>
          <Text fw={600} size="sm" className={classes.title}>
            {purposes}
          </Text>
          <Text size="sm" c="dimmed">
            {formatDate(request.created)}
          </Text>
        </Stack>
      </Group>
    </MedplumLink>
  );
}

function formatPurpose(purpose: string): string {
  switch (purpose) {
    case 'auth-requirements':
      return 'Auth Requirements';
    case 'benefits':
      return 'Benefits';
    case 'discovery':
      return 'Discovery';
    case 'validation':
      return 'Validation';
    default:
      return purpose;
  }
}

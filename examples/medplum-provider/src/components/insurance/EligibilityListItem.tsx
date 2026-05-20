// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Stack, Text } from '@mantine/core';
import { formatDateTime } from '@medplum/core';
import type { CoverageEligibilityRequest } from '@medplum/fhirtypes';
import { ListItem } from '@medplum/react';
import type { JSX } from 'react';
import { formatPurpose } from './utils';

interface EligibilityListItemProps {
  request: CoverageEligibilityRequest;
  isSelected: boolean;
  href: string;
}

export function EligibilityListItem({ request, isSelected, href }: EligibilityListItemProps): JSX.Element {
  const purposes = request.purpose?.map(formatPurpose).join(', ') ?? 'Eligibility Check';

  return (
    <ListItem to={href} selected={isSelected}>
      <Stack gap={4} miw={0}>
        <Text fw={600} size="sm" truncate="end">
          {purposes}
        </Text>
        <Text size="sm" c="dimmed">
          {formatDateTime(request.created)}
        </Text>
      </Stack>
    </ListItem>
  );
}

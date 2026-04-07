// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Badge, Box, Button, Card, Divider, Flex, Group, Stack, Text } from '@mantine/core';
import { formatDateTime } from '@medplum/core';
import { IconExternalLink } from '@tabler/icons-react';
import type { JSX, ReactNode } from 'react';

const CANDID_CLAIM_BASE_URL = 'https://app-staging.joincandidhealth.com/claims/';

export interface ClaimSubmittedPanelProps {
  status?: string;
  claimAmount: number;
  createdAt?: string;
  candidEncounterId?: string;
  exportMenu: ReactNode;
}

export const ClaimSubmittedPanel = (props: ClaimSubmittedPanelProps): JSX.Element => {
  const { status, claimAmount, createdAt, candidEncounterId, exportMenu } = props;

  return (
    <Card withBorder shadow="sm" p={0}>
      <Stack p="md" gap="md">
        <Flex align="center" justify="space-between" gap="md">
          <Stack gap={4} miw={100}>
            <Text size="xs" c="dimmed">
              Claim Status:
            </Text>
            {status && (
              <Badge color={getStatusColor(status)} radius="xl" variant="filled">
                {formatCandidStatus(status)}
              </Badge>
            )}
          </Stack>
          <Box style={{ flex: 1 }}>
            <Text size="sm">
              Claim submitted for{' '}
              <Text component="span" fw={700}>
                ${claimAmount}
              </Text>
              .
            </Text>
            {createdAt && (
              <Text size="sm" c="dimmed">
                Submitted on {formatDateTime(createdAt)}
              </Text>
            )}
          </Box>
          {candidEncounterId && (
            <Button
              variant="outline"
              rightSection={<IconExternalLink size={14} />}
              onClick={() => window.open(`${CANDID_CLAIM_BASE_URL}${candidEncounterId}`, '_blank')}
            >
              View Claim on Candid
            </Button>
          )}
        </Flex>
        <Divider />
        <Group>{exportMenu}</Group>
      </Stack>
    </Card>
  );
};

const getStatusColor = (status: string): string => {
  if (['rejected', 'denied'].includes(status)) {
    return 'red';
  }
  if (['paid', 'finalized_paid'].includes(status)) {
    return 'green';
  }
  return 'violet';
};

const formatCandidStatus = (status: string): string =>
  status
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');

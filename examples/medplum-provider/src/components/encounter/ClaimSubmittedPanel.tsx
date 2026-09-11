// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Badge, Box, Button, Card, Divider, Flex, Group, Loader, Stack, Text, Tooltip } from '@mantine/core';
import { formatDateTime } from '@medplum/core';
import type { ClaimResponse, Reference } from '@medplum/fhirtypes';
import { useMedplum, useResource, useSearchOne } from '@medplum/react';
import { IconExternalLink } from '@tabler/icons-react';
import type { JSX, ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { CANDID_CLAIM_URL_BOT_IDENTIFIER, getCandidClaimStatus, isCandidClaimResponse } from '../../utils/candid';
import { showErrorNotification } from '../../utils/notifications';
import { formatStediClaimStatus, getStediClaimStatus } from '../../utils/stedi';

interface GetCandidClaimUrlOutput {
  encounterId: string;
  url: string;
}

export interface ClaimSubmittedPanelProps {
  claimResponse: ClaimResponse | Reference<ClaimResponse>;
  exportMenu: ReactNode;
}

export const ClaimSubmittedPanel = (props: ClaimSubmittedPanelProps): JSX.Element | null => {
  const { claimResponse, exportMenu } = props;
  const medplum = useMedplum();
  const claimResponseResource = useResource(claimResponse);
  // Only look up the bot; if it isn't deployed in this project the button never renders.
  const [candidUrlBot] = useSearchOne('Bot', {
    identifier: `${CANDID_CLAIM_URL_BOT_IDENTIFIER.system}|${CANDID_CLAIM_URL_BOT_IDENTIFIER.value}`,
  });
  const [candidClaimUrl, setCandidClaimUrl] = useState<string>();
  const [candidUrlLoading, setCandidUrlLoading] = useState(false);

  const botId = candidUrlBot?.id;
  const isCandidClaim = claimResponseResource && isCandidClaimResponse(claimResponseResource);

  useEffect(() => {
    let active = true;

    if (!botId || !claimResponseResource || !isCandidClaim) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCandidClaimUrl(undefined);
      setCandidUrlLoading(false);
      return () => {
        active = false;
      };
    }

    setCandidUrlLoading(true);

    const resolveCandidClaimUrl = async (): Promise<void> => {
      const result = (await medplum.executeBot(
        botId,
        claimResponseResource,
        'application/fhir+json'
      )) as GetCandidClaimUrlOutput;
      if (active) {
        setCandidClaimUrl(result?.url || undefined);
      }
    };

    resolveCandidClaimUrl()
      .catch((err) => {
        if (active) {
          showErrorNotification(err);
        }
      })
      .finally(() => {
        if (active) {
          setCandidUrlLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [botId, claimResponseResource, isCandidClaim, medplum]);

  if (!claimResponseResource) {
    return null;
  }

  const candidStatus = getCandidClaimStatus(claimResponseResource);
  const stediStatus = candidStatus ? undefined : getStediClaimStatus(claimResponseResource);
  const createdAt = claimResponseResource.created;
  const claimAmount = claimResponseResource.total?.reduce((sum, total) => sum + (total.amount?.value ?? 0), 0) ?? 0;

  return (
    <Card withBorder shadow="sm" p={0}>
      <Stack p="md" gap="md">
        <Flex align="center" justify="space-between" gap="md">
          <Stack gap={4} miw={100}>
            <Text size="xs" c="dimmed">
              Claim Status:
            </Text>
            {candidStatus && (
              <Badge color={getStatusColor(candidStatus)} radius="xl" variant="filled">
                {formatCandidStatus(candidStatus)}
              </Badge>
            )}
            {stediStatus && (
              <Tooltip label={stediStatus.display} disabled={!stediStatus.display} multiline maw={360}>
                <Badge color={getStediStatusColor(stediStatus.code)} radius="xl" variant="filled">
                  {formatStediClaimStatus(stediStatus)}
                </Badge>
              </Tooltip>
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
          {candidUrlLoading ? (
            <Loader size="sm" />
          ) : (
            candidClaimUrl && (
              <Button
                variant="outline"
                rightSection={<IconExternalLink size={14} />}
                onClick={() => window.open(candidClaimUrl, '_blank')}
              >
                View Claim on Candid
              </Button>
            )
          )}
        </Flex>
        <Divider />
        <Group>{exportMenu}</Group>
      </Stack>
    </Card>
  );
};

// X12 507 category codes group by first letter; see formatStediClaimStatus.
const getStediStatusColor = (code: string | undefined): string => {
  switch (code?.charAt(0)) {
    case 'F':
      return 'green';
    case 'P':
      return 'yellow';
    case 'E':
      return 'red';
    default:
      return 'violet';
  }
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

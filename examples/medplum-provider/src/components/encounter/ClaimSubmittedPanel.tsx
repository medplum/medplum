// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Badge, Box, Button, Card, Divider, Flex, Group, Loader, Stack, Text } from '@mantine/core';
import { formatDateTime } from '@medplum/core';
import type { ClaimResponse, Reference } from '@medplum/fhirtypes';
import { useMedplum, useResource, useSearchOne } from '@medplum/react';
import { IconExternalLink } from '@tabler/icons-react';
import type { JSX, ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { showErrorNotification } from '../../utils/notifications';

// Identifier of the deployed bot that resolves a Candid Health claim portal URL.
// The URL itself lives in the bot's secrets, so it is never hardcoded here.
const CANDID_CLAIM_URL_BOT_IDENTIFIER = {
  system: 'https://medplum.com/integrations/candid-health',
  value: 'get-candid-claim-portal-url',
};

// Identifier the send-to-candid bot writes onto the ClaimResponse; its presence marks the
// claim as a Candid claim and is what the URL bot reads to build the portal link.
const CANDID_ENCOUNTER_ID_SYSTEM = 'https://candidhealth.com/encounter-id';

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
  const isCandidClaimResponse = claimResponseResource?.identifier?.some(
    (id) => id.system === CANDID_ENCOUNTER_ID_SYSTEM
  );

  useEffect(() => {
    let active = true;

    if (!botId || !claimResponseResource || !isCandidClaimResponse) {
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
  }, [botId, claimResponseResource, isCandidClaimResponse, medplum]);

  if (!claimResponseResource) {
    return null;
  }

  const status = 'Submitted';
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

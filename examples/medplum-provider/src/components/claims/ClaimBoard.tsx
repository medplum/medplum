// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Box, Flex, Stack, Text } from '@mantine/core';
import type { SearchRequest } from '@medplum/core';
import { parseSearchRequest } from '@medplum/core';
import type { Claim } from '@medplum/fhirtypes';
import { ResourceBoard } from '@medplum/react';
import type { JSX } from 'react';
import { useMemo } from 'react';
import { useNavigate } from 'react-router';
import { showErrorNotification } from '../../utils/notifications';
import { ClaimDetailPanel } from './ClaimDetailPanel';
import { ClaimListItem } from './ClaimListItem';
import { ClaimSelectEmpty } from './ClaimSelectEmpty';

interface ClaimBoardProps {
  /** The patient whose claims are listed. */
  readonly patientId: string;
  /** The selected claim id, driven by the route param. */
  readonly claimId: string | undefined;
  /** The search query string (sort/count/offset); the patient filter is added internally. */
  readonly query: string;
  /** Builds the route a claim's row links to (and the auto-selected first claim navigates to). */
  readonly getClaimUri: (claim: Claim) => string;
  /** Fired by the built-in pagination with the updated offset. */
  readonly onChange: (search: SearchRequest) => void;
}

/**
 * ClaimBoard is the master-detail board for a patient's claims: a list of Claim resources
 * on the left and the selected claim's detail (with its ClaimResponse) on the right. It owns
 * the search construction and wires Claim-specific list/detail/empty renderers into the
 * generic ResourceBoard shell.
 *
 * @param props - The ClaimBoard props.
 * @returns The ClaimBoard React node.
 */
export function ClaimBoard(props: ClaimBoardProps): JSX.Element {
  const { patientId, claimId, query, getClaimUri, onChange } = props;
  const navigate = useNavigate();
  const search = useMemo<SearchRequest>(
    () => parseSearchRequest(`Claim?${query}&patient=${patientId}`),
    [query, patientId]
  );

  return (
    <Box w="100%" h="100%">
      <ResourceBoard<Claim>
        search={search}
        selectedId={claimId}
        renderItem={(claim, { index, items }) => (
          <ClaimListItem
            claim={claim}
            getClaimUri={getClaimUri}
            hideDivider={index < items.length - 1 && items[index + 1]?.id === claimId}
          />
        )}
        emptyList={<EmptyClaimsState />}
        renderDetail={(claim) => <ClaimDetailPanel key={claim.id} claim={claim} />}
        emptyDetail={<ClaimSelectEmpty />}
        onChange={onChange}
        onSelectFirst={(claim) => {
          navigate(getClaimUri(claim), { replace: true })?.catch(console.error);
        }}
        onError={showErrorNotification}
      />
    </Box>
  );
}

function EmptyClaimsState(): JSX.Element {
  return (
    <Flex direction="column" h="100%" justify="center" align="center" pt="xl">
      <Stack align="center" gap="md">
        <Text c="dimmed" fw={500}>
          No claims for this patient.
        </Text>
      </Stack>
    </Flex>
  );
}

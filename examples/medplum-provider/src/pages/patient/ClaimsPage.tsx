// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Box, Flex, Stack, Text } from '@mantine/core';
import type { SearchRequest } from '@medplum/core';
import { parseSearchRequest } from '@medplum/core';
import type { Claim } from '@medplum/fhirtypes';
import { ResourceBoard } from '@medplum/react';
import type { JSX } from 'react';
import { useCallback, useMemo } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { ClaimDetailPanel } from '../../components/claims/ClaimDetailPanel';
import { ClaimListItem } from '../../components/claims/ClaimListItem';
import { ClaimSelectEmpty } from '../../components/claims/ClaimSelectEmpty';
import { showErrorNotification } from '../../utils/notifications';

const CLAIM_QUERY_BASE = '_count=20&_sort=-_lastUpdated';

export function ClaimsPage(): JSX.Element {
  const { patientId, claimId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const offset = searchParams.get('_offset');
  const query = `${CLAIM_QUERY_BASE}&patient=${patientId}${offset ? `&_offset=${offset}` : ''}`;
  const search = useMemo<SearchRequest>(() => parseSearchRequest(`Claim?${query}`), [query]);

  const getClaimUri = useCallback(
    (claim: Claim): string => `/Patient/${patientId}/Claim/${claim.id}?${query}`,
    [patientId, query]
  );

  // Pagination: write the new offset to the URL (drops the selected claim so the new
  // page auto-selects its first item via the board's onSelectFirst).
  const onChange = useCallback(
    (next: SearchRequest): void => {
      const newOffset = next.offset ?? 0;
      navigate(`/Patient/${patientId}/Claim?${CLAIM_QUERY_BASE}${newOffset > 0 ? `&_offset=${newOffset}` : ''}`)?.catch(
        console.error
      );
    },
    [navigate, patientId]
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

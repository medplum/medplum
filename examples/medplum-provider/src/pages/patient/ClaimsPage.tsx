// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { SearchRequest } from '@medplum/core';
import type { Claim } from '@medplum/fhirtypes';
import type { JSX } from 'react';
import { useCallback } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { ClaimBoard } from '../../components/claims/ClaimBoard';

const CLAIM_QUERY_BASE = '_count=20&_sort=-_lastUpdated';

export function ClaimsPage(): JSX.Element {
  const { patientId = '', claimId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const offset = searchParams.get('_offset');
  const query = `${CLAIM_QUERY_BASE}${offset ? `&_offset=${offset}` : ''}`;

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
    <ClaimBoard patientId={patientId} claimId={claimId} query={query} getClaimUri={getClaimUri} onChange={onChange} />
  );
}

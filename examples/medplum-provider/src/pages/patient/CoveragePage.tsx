// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { SearchRequest } from '@medplum/core';
import { formatSearchQuery } from '@medplum/core';
import type { Coverage, CoverageEligibilityRequest } from '@medplum/fhirtypes';
import type { JSX } from 'react';
import { useEffect, useMemo } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import { CoverageRequestInbox } from '../../components/insurance/CoverageRequestInbox';

export function CoveragePage(): JSX.Element {
  const { patientId = '', coverageId, requestId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  // Normalize the query: inject _sort and _count defaults if absent.
  const { normalizedSearch, needsRedirect } = useMemo(() => {
    const params = new URLSearchParams(location.search ? location.search.substring(1) : '');
    let changed = false;
    if (!params.has('_sort')) {
      params.set('_sort', '-_lastUpdated');
      changed = true;
    }
    if (!params.has('_count')) {
      params.set('_count', '20');
      changed = true;
    }
    return { normalizedSearch: params.toString(), needsRedirect: changed };
  }, [location.search]);

  // Redirect once to the normalized URL (replace so back-button still works).
  useEffect(() => {
    if (needsRedirect) {
      const base = coverageId
        ? `/Patient/${patientId}/Coverage/${coverageId}`
        : `/Patient/${patientId}/Coverage`;
      navigate(`${base}?${normalizedSearch}`, { replace: true })?.catch(console.error);
    }
  }, [needsRedirect, normalizedSearch, navigate, patientId, coverageId]);

  const getRequestHref = (coverage: Coverage, request: CoverageEligibilityRequest): string =>
    `/Patient/${patientId}/Coverage/${coverage.id}/CoverageEligibilityRequest/${request.id}?${normalizedSearch}`;

  const onChange = (search: SearchRequest): void => {
    const base = coverageId
      ? `/Patient/${patientId}/Coverage/${coverageId}`
      : `/Patient/${patientId}/Coverage`;
    navigate(`${base}${formatSearchQuery(search)}`)?.catch(console.error);
  };

  return (
    <CoverageRequestInbox
      query={normalizedSearch}
      patientId={patientId}
      coverageId={coverageId}
      requestId={requestId}
      onChange={onChange}
      getRequestHref={getRequestHref}
    />
  );
}
